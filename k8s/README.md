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
| `migration-job.yaml` | Migração do Prisma, rodada pelo CD antes de cada deploy |

O namespace `billing` é criado pelo `oficina-infra-k8s` (`k8s/platform/namespaces.yaml`).

ConfigMap e Secret são aplicados à mão, uma vez por sessão, depois de a infra subir. O CD aplica o resto:

```bash
kubectl apply -f k8s/configmap.yaml
cp k8s/secret.example.yaml k8s/secret.yaml   # preencher; secret.yaml é ignorado pelo git
kubectl apply -f k8s/secret.yaml
```

**`PUBLIC_BASE_URL`** (ConfigMap) é a URL do API Gateway, que muda a cada apply do `oficina-lambda-auth`. Ela entra no `notification_url` de cada checkout; atualize o ConfigMap (e a URL do webhook no painel do Mercado Pago) a cada sessão.

O Redis (`redis.yaml`) é aplicado à mão junto com o Secret, porque usa a `REDIS_PASSWORD` dele:

```bash
kubectl apply -f k8s/redis.yaml
```
