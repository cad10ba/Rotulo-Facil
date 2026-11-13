/**
 * ATENÇÃO: A estrutura do banco de dados no Supabase (schema rotulo, tabelas, triggers e políticas RLS)
 * é mantida exclusivamente por script SQL no próprio Supabase.
 * O drizzle-kit NÃO deve ser executado (não rode push, migrate ou generate).
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  schemaFilter: ['rotulo'],
});
