# PulseWork Local Sync

Agente independente em Node.js (sem dependências externas) para monitorar uma pasta local de projetos, identificar `README.md`, ler histórico Git e sincronizar apenas metadados e alterações relevantes com a plataforma.

## Como usar

1. No sistema web, acesse **Projetos → Conectar sincronizador** e gere um token de dispositivo (`pw_sync_...`).
2. Execute uma sincronização única de teste:

```powershell
cd local-sync
node src/index.mjs --url http://localhost:3000 --token pw_sync_SEU_TOKEN --path "C:\Projetos" --once
```

3. Para deixar monitorando continuamente (a cada 60 segundos):

```powershell
node src/index.mjs --url http://localhost:3000 --token pw_sync_SEU_TOKEN --path "C:\Projetos" --interval 60
```
