import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  isBrevoConfigured,
  sendConfirmationEmailViaBrevo,
  sendPasswordResetEmailViaBrevo,
} from './src/lib/brevo.ts';
import {
  InvalidRecipeIdError,
  RecipeNotFoundError,
  createUserRecipe,
  deleteUserRecipe,
  getUserRecipes,
  migrateUserRecipes,
  updateUserRecipe,
} from './src/db/recipes.ts';
import { verifyDatabaseRlsRole } from './src/db/index.ts';
import { deleteUserAccountData } from './src/db/users.ts';
import { assertEncryptionConfigured } from './src/lib/crypto.ts';
import { getTacoItemById, searchTacoItems } from './src/server/taco.ts';
import {
  migrateRecipesInputSchema,
  recipeInputSchema,
} from './src/validation/recipeSchemas.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    frameguard: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const RATE_LIMIT_AUTH_MESSAGE = {
  error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.',
};

const tacoMatchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = (req as AuthRequest).user?.uid;
    return uid ? `user:${uid}` : `ip:${ipKeyGenerator(req.ip || '')}`;
  },
  message: {
    error: 'Limite de consultas à IA atingido (30 requisições por minuto). Aguarde um instante.',
  },
});

const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `forgot-ip:${ipKeyGenerator(req.ip || '')}`,
  message: RATE_LIMIT_AUTH_MESSAGE,
});

const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return rawEmail
      ? `forgot-email:${rawEmail}`
      : `forgot-email-ip:${ipKeyGenerator(req.ip || '')}`;
  },
  message: RATE_LIMIT_AUTH_MESSAGE,
});

const sendVerificationIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `verify-ip:${ipKeyGenerator(req.ip || '')}`,
  message: RATE_LIMIT_AUTH_MESSAGE,
});

const sendVerificationEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req as AuthRequest).user?.email?.trim().toLowerCase();
    return email
      ? `verify-email:${email}`
      : `verify-email-ip:${ipKeyGenerator(req.ip || '')}`;
  },
  message: RATE_LIMIT_AUTH_MESSAGE,
});

async function verifyBearerForEmailVerification(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de sessão ausente.' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (!decoded.email) {
      return res.status(400).json({ error: 'E-mail não encontrado na conta.' });
    }
    req.user = decoded;
    return next();
  } catch (error) {
    console.error(
      'Erro ao verificar token em send-verification:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
  }
}

// Busca fuzzy sem acento e case-insensitive na Tabela TACO (CSV oficial) — requer login
app.get('/api/taco/search', requireAuth, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    return res.json({ items: [] });
  }
  const items = searchTacoItems(q, 10);
  return res.json({ items });
});

// Lista arquivos oficiais opcionais adicionados pelo usuário em public/lupa/
app.get('/api/lupa/assets', (_req, res) => {
  const candidates = [
    path.resolve(__dirname, 'public', 'lupa'),
    path.resolve(__dirname, 'dist', 'lupa'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter((name) => /\.(svg|png|jpe?g|webp)$/i.test(name))
          .sort();
        return res.json({ files });
      }
    } catch {
      // ignora erro de leitura e tenta próximo diretório
    }
  }
  return res.json({ files: [] });
});

// Correspondência assistida por IA: requer login e limite de 30 req/min por usuário
app.post('/api/taco/match', requireAuth, tacoMatchLimiter, async (req, res) => {
  const { ingredientName } = req.body || {};

  if (!ingredientName || typeof ingredientName !== 'string' || !ingredientName.trim()) {
    return res.status(400).json({ error: 'Nome do ingrediente é obrigatório.' });
  }

  const cleanName = ingredientName.trim();
  const candidates = searchTacoItems(cleanName, 10);

  if (candidates.length === 0) {
    return res.json({ match: null, candidates: [], aiFailed: false });
  }

  const candidateListText = candidates
    .map((c) => `- tacoId: "${c.tacoId}" | nome: "${c.nome}" | categoria: "${c.categoria}"`)
    .join('\n');

  const prompt = `Você é um especialista na Tabela TACO (UNICAMP 4ª edição).
O usuário digitou o ingrediente: "${cleanName}".
Abaixo estão até 10 candidatos mais próximos da Tabela TACO oficial:
${candidateListText}

Escolha SOMENTE o tacoId da lista acima que realmente corresponde ao ingrediente digitado (considerando equivalências diretas da TACO, como forma crua padrão quando o preparo não for especificado).
Se nenhum candidato corresponder adequadamente ao ingrediente digitado, retorne tacoId = null.
NUNCA invente valores nutricionais nem tacoId fora da lista.`;

  let responseText = '';
  let lastError: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tacoId: {
                type: Type.STRING,
                nullable: true,
                description:
                  'O tacoId exato da lista de candidatos que corresponde ao ingrediente, ou null se nenhum corresponder.',
              },
            },
            required: ['tacoId'],
          },
        },
      });
      responseText = response.text || '';
      if (responseText) break;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!responseText) {
    console.warn('Gemini unavailable in /api/taco/match:', lastError?.message || lastError);
    return res.json({
      match: null,
      candidates,
      aiFailed: true,
      error: 'Não foi possível consultar a IA no momento. Escolha manualmente um dos candidatos abaixo.',
    });
  }

  try {
    const parsed = JSON.parse(responseText) as { tacoId?: string | null };
    const rawId = parsed?.tacoId;

    if (
      rawId === null ||
      rawId === undefined ||
      String(rawId).trim() === '' ||
      String(rawId).trim().toLowerCase() === 'null' ||
      String(rawId).trim().toLowerCase() === 'nenhum'
    ) {
      return res.json({ match: null, candidates, aiFailed: false });
    }

    const cleanId = String(rawId).trim();
    const matchedCandidate =
      candidates.find((c) => c.tacoId === cleanId) || getTacoItemById(cleanId) || null;

    return res.json({
      match: matchedCandidate,
      candidates,
      aiFailed: false,
    });
  } catch (parseErr: any) {
    console.warn('Invalid JSON from Gemini in /api/taco/match:', parseErr?.message || parseErr);
    return res.json({
      match: null,
      candidates,
      aiFailed: true,
      error: 'Resposta inválida da IA. Escolha manualmente um dos candidatos abaixo.',
    });
  }
});

// ==========================================
// AUTENTICAÇÃO E E-MAILS TRANSACIONAIS BREVO
// ==========================================

function resolveAppBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

app.post(
  '/api/auth/send-verification',
  sendVerificationIpLimiter,
  verifyBearerForEmailVerification,
  sendVerificationEmailLimiter,
  async (req: AuthRequest, res) => {
    try {
      const decoded = req.user!;
      const email = decoded.email!;

      if (decoded.email_verified) {
        return res.json({ sent: false, alreadyVerified: true });
      }

      if (!isBrevoConfigured()) {
        return res.status(503).json({
          code: 'BREVO_NOT_CONFIGURED',
          error:
            'Serviço de envio Brevo não configurado. Adicione BREVO_API_KEY nos Secrets para enviar o link de confirmação.',
        });
      }

      const continueUrl = resolveAppBaseUrl(req);
      const verificationLink = await adminAuth.generateEmailVerificationLink(email, {
        url: continueUrl,
        handleCodeInApp: false,
      });

      await sendConfirmationEmailViaBrevo(
        email,
        typeof decoded.name === 'string' ? decoded.name : undefined,
        verificationLink
      );

      return res.json({ sent: true, email });
    } catch (error) {
      console.error(
        'Erro ao enviar confirmação via Brevo:',
        error instanceof Error ? error.name : 'UnknownError'
      );
      return res.status(500).json({
        error: 'Não foi possível enviar o link de confirmação por e-mail.',
      });
    }
  }
);

const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  sent: true,
  message:
    'Se existir uma conta para este e-mail, enviamos o link de redefinição de senha.',
};

app.post(
  '/api/auth/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  async (req, res) => {
    const rawEmail = req.body?.email;
    const cleanEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!cleanEmail) {
      return res.status(200).json(GENERIC_FORGOT_PASSWORD_RESPONSE);
    }

    try {
      if (!isBrevoConfigured()) {
        console.error('BREVO_API_KEY não configurada ao processar /api/auth/forgot-password.');
        return res.status(200).json(GENERIC_FORGOT_PASSWORD_RESPONSE);
      }

      const continueUrl = resolveAppBaseUrl(req);
      const resetLink = await adminAuth.generatePasswordResetLink(cleanEmail, {
        url: continueUrl,
        handleCodeInApp: false,
      });
      await sendPasswordResetEmailViaBrevo(cleanEmail, resetLink);
    } catch (error) {
      console.error(
        'Erro em /api/auth/forgot-password:',
        error instanceof Error ? error.name : 'UnknownError'
      );
    }

    return res.status(200).json(GENERIC_FORGOT_PASSWORD_RESPONSE);
  }
);

// ==========================================
// RECEITAS COM ISOLAMENTO POR USUÁRIO (RLS)
// ==========================================

app.get('/api/recipes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const list = await getUserRecipes(uid);
    return res.json({ recipes: list });
  } catch {
    return res.status(500).json({ error: 'Erro interno ao carregar receitas.' });
  }
});

app.post('/api/recipes', requireAuth, async (req: AuthRequest, res) => {
  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Dados inválidos para criação da receita.',
    });
  }

  try {
    const uid = req.user!.uid;
    const saved = await createUserRecipe(uid, parsed.data);
    return res.status(201).json({ recipe: saved });
  } catch {
    return res.status(500).json({ error: 'Erro interno ao salvar receita.' });
  }
});

app.put('/api/recipes/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Dados inválidos para atualização da receita.',
    });
  }

  try {
    const uid = req.user!.uid;
    const saved = await updateUserRecipe(uid, req.params.id, parsed.data);
    return res.json({ recipe: saved });
  } catch (error) {
    if (error instanceof InvalidRecipeIdError) {
      return res.status(400).json({ error: 'ID de receita inválido.' });
    }
    if (error instanceof RecipeNotFoundError) {
      return res.status(404).json({ error: 'Receita não encontrada.' });
    }
    return res.status(500).json({ error: 'Erro interno ao atualizar receita.' });
  }
});

app.delete('/api/recipes/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const deleted = await deleteUserRecipe(uid, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Receita não encontrada.' });
    }
    return res.json({ deleted: true });
  } catch (error) {
    if (error instanceof InvalidRecipeIdError) {
      return res.status(400).json({ error: 'ID de receita inválido.' });
    }
    return res.status(500).json({ error: 'Erro interno ao excluir receita.' });
  }
});

app.post('/api/recipes/migrate', requireAuth, async (req: AuthRequest, res) => {
  const parsed = migrateRecipesInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Formato inválido de receitas para transferência.',
    });
  }

  try {
    const uid = req.user!.uid;
    const merged = await migrateUserRecipes(uid, parsed.data.recipes);
    return res.json({ recipes: merged });
  } catch {
    return res.status(500).json({ error: 'Erro interno ao transferir receitas.' });
  }
});

// ==========================================
// CONTA DO USUÁRIO (LGPD)
// ==========================================

app.get('/api/account/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const recipesList = await getUserRecipes(uid);
    return res.json({
      exportedAt: new Date().toISOString(),
      recipes: recipesList,
    });
  } catch {
    return res.status(500).json({ error: 'Erro interno ao exportar dados da conta.' });
  }
});

app.delete('/api/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    await deleteUserAccountData(uid);
    await adminAuth.deleteUser(uid);
    return res.json({ deleted: true });
  } catch (error) {
    console.error(
      'Erro ao excluir conta do usuário:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return res.status(500).json({ error: 'Erro interno ao excluir a conta.' });
  }
});

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Tamanho da requisição excede o limite de 1 MB.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido na requisição.' });
    }
    return next(err);
  }
);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    assertEncryptionConfigured();
  } catch (err) {
    console.error(
      'Erro fatal na configuração de criptografia:',
      err instanceof Error ? err.message : 'DATA_ENCRYPTION_KEY inválida.'
    );
    process.exit(1);
  }

  try {
    await verifyDatabaseRlsRole();
    console.log('Banco Supabase conectado com RLS ativo');
  } catch (err) {
    console.error(
      'Erro fatal de segurança no banco de dados:',
      err instanceof Error ? err.message : 'Usuário de banco inválido para RLS.'
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
