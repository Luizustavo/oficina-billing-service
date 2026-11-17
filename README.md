# oficina-billing-service

Billing Service da oficina mecânica (Tech Challenge SOAT, Fase 4): orçamento, aprovação pelo cliente, pagamento pelo **Mercado Pago Checkout Pro** e estorno.

É um dos três microsserviços do sistema:

| Serviço | Responsabilidade | Banco |
|---|---|---|
| [`oficina-backend`](https://github.com/Luizustavo/oficina-backend) (OS Service) | Ordem de serviço, clientes, veículos, catálogo, estoque. **Orquestra a saga** | PostgreSQL (`oficina_db`) |
| **`oficina-billing-service`** | Orçamento, aprovação, pagamento e estorno | PostgreSQL (`billing_db`) + Redis |
| [`oficina-execution-service`](https://github.com/Luizustavo/oficina-execution-service) | Fila e andamento do reparo | MongoDB |

Os serviços conversam só por mensagens no RabbitMQ, seguindo o [contrato de mensagens](https://github.com/Luizustavo/oficina-backend/blob/main/docs/arquitetura/contratos-de-mensagens.md). Nenhum serviço acessa o banco de outro. As decisões de arquitetura (ADRs 009 a 015) ficam no repositório `oficina-backend`.

## Rodando localmente

```bash
npm install
npm run start:dev          # http://localhost:3000/api/billing/docs
```

| Comando | O que faz |
|---|---|
| `npm test -- --coverage` | Testes unitários, cobertura mínima de 80% |
| `npm run test:e2e` | Sobe a aplicação e testa as rotas |
| `npm run test:int` | Testes de integração (banco e broker de verdade) |
| `npm run lint` | ESLint + Prettier |

## Rotas

Todas com o prefixo `/api/billing`, que o Traefik usa para encaminhar ao serviço (ADR-015).

| Rota | Descrição |
|---|---|
| `GET /api/billing/health/live` e `/ready` | Probes do Kubernetes |
| `GET /api/billing/docs` | Swagger |

## CI/CD

Mesma esteira do `oficina-backend` ([esteira-ci-cd.md](https://github.com/Luizustavo/oficina-backend/blob/main/docs/arquitetura/esteira-ci-cd.md)): lint, testes unitários com cobertura de 80%, Quality Gate do SonarCloud, testes de integração e E2E, build e smoke test da imagem. O merge na `main` dispara o deploy no k3s, com aprovação no Environment `production`.

## Kubernetes

Manifestos em [`k8s/`](k8s/README.md), no namespace `billing` (criado pelo `oficina-infra-k8s`).
