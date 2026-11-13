/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 32, className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="RótuloFácil"
      className={className}
    >
      <rect width="100" height="100" rx="22" fill="#059669" />
      <rect x="25" y="18" width="50" height="64" rx="7" fill="#ffffff" />
      <rect x="32" y="26" width="36" height="7" rx="2" fill="#064e3b" />
      <rect x="32" y="45" width="36" height="5" rx="2" fill="#059669" />
      <rect x="32" y="56" width="36" height="5" rx="2" fill="#059669" />
      <rect x="32" y="67" width="36" height="5" rx="2" fill="#059669" />
    </svg>
  );
};
