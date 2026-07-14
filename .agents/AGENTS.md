# DispatchBox — Project Rules

## Deployment Policy

After completing any development work (features, fixes, changes), **automatically deploy to the staging sandbox** without asking. Do NOT deploy to production unless the user explicitly requests it.

The staging sandbox URL is: https://dispatch-box-sb.web.app
The production URL is: https://maintenancemanager-c5533.web.app

After every staging deploy, always remind the user that production was NOT updated.

## Environment Files

The project has two Firebase environments:
- **Production**: `maintenancemanager-c5533` (alias: `default`)
- **Staging**: `dispatch-box-sb` (alias: `staging`)

Frontend env files:
- `.env.production` → production Firebase config
- `.env.staging` → staging Firebase config

The deploy script automatically uses `--mode staging` or `--mode production` to load the correct env file during the Vite build step.

Always switch back to `firebase use default` after a staging deploy.
