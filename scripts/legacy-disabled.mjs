console.error(
  'O servidor Node legado foi desativado após a auditoria: não possui os controles do Worker. Use npm run dev para a interface de demonstração, npm run test:worker para integração local e docs/CLOUDFLARE.md para o backend protegido.',
);
process.exit(1);
