# Manifestos do Billing Service

| Arquivo | O que define |
|---|---|
| `deployment.yaml` | O serviço: 1 réplica, 192 a 384 Mi de memória, probes em `/api/billing/health` |
| `service.yaml` | Endereço interno (`ClusterIP`) |
| `ingress.yaml` | O Traefik encaminha `/api/billing` para cá |
| `hpa.yaml` | Escala de 1 a 2 réplicas por CPU e memória |
| `configmap.yaml` | Configuração sem segredo |
| `secret.example.yaml` | Modelo do Secret: banco, JWT, RabbitMQ, New Relic |
| `redis.yaml` | Redis do Billing (idempotência do webhook e trava por OS), 512 Mi de disco, só dentro do cluster |
| `bootstrap-db-job.yaml` | Cria o `billing_db` e o `billing_user` no RDS, idempotente. O `billing_user` é dono só do `billing_db` e não conecta no `oficina_db` |
| `billing-db-admin.example.yaml` | Modelo do Secret usado só pelo bootstrap (URL da conta mestre do RDS) |
| `migration-job.yaml` | Migração do Prisma, rodada pelo CD antes de cada deploy |

O namespace `billing` é criado pelo `oficina-infra-k8s` (`k8s/platform/namespaces.yaml`).

Aplicado à mão, uma vez por sessão (depois de a infra subir), porque guarda segredos:

```bash
cp k8s/secret.example.yaml k8s/secret.yaml                     # preencher
cp k8s/billing-db-admin.example.yaml k8s/billing-db-admin.yaml # preencher
kubectl apply -f k8s/billing-db-admin.yaml -f k8s/secret.yaml
```

O CD faz o resto, nesta ordem: job de bootstrap do banco, ConfigMap (com a `PUBLIC_BASE_URL` descoberta no API Gateway `oficina-backend-api`), migração, Redis, Deployment, Service, Ingress e HPA.

A senha do `billing_user` aparece em dois lugares e precisa ser a mesma: `BILLING_DB_PASSWORD` no `billing-db-admin.yaml` e dentro do `DATABASE_URL` do `secret.yaml`.

**Webhook do Mercado Pago:** cada checkout já sai com `notification_url` apontando para a `PUBLIC_BASE_URL` da sessão. Atualize também a URL de teste em *Webhooks* no painel do Mercado Pago, para os avisos configurados por lá.
