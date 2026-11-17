# Manifestos do Billing Service

| Arquivo | O que define |
|---|---|
| `deployment.yaml` | O serviço: 1 réplica, 192 a 384 Mi de memória, probes em `/api/billing/health` |
| `service.yaml` | Endereço interno (`ClusterIP`) |
| `ingress.yaml` | O Traefik encaminha `/api/billing` para cá |
| `hpa.yaml` | Escala de 1 a 2 réplicas por CPU e memória |
| `configmap.yaml` | Configuração sem segredo |
| `secret.example.yaml` | Modelo do Secret: banco, JWT, RabbitMQ, New Relic |
| `migration-job.yaml` | Migração do Prisma, rodada pelo CD antes de cada deploy |

O namespace `billing` é criado pelo `oficina-infra-k8s` (`k8s/platform/namespaces.yaml`).

ConfigMap e Secret são aplicados à mão, uma vez por sessão, depois de a infra subir. O CD aplica o resto:

```bash
kubectl apply -f k8s/configmap.yaml
cp k8s/secret.example.yaml k8s/secret.yaml   # preencher; secret.yaml é ignorado pelo git
kubectl apply -f k8s/secret.yaml
```
