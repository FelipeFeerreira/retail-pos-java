# Empório POS — Sistema de Caixa e Gestão para Mercados

PDV e back-office completo para pequenos mercados, mercearias e empórios. Controle de vendas, estoque, fiado, compras, financeiro e relatórios em uma única aplicação local, com interface moderna e responsiva.

![Login](portfolio/01-login.png)

## Visão geral

- **Frontend:** React 18, TypeScript, Vite e Material UI
- **Backend:** Java 17, Spring Boot, Maven, Flyway e JWT
- **Banco:** PostgreSQL 15
- **Infra:** Docker Compose, backup automático com `pg_dump`
- **Hardware:** balança Toledo Prix 8217 (Web Serial) e impressora térmica Control iD 80 mm

A interface foi projetada para monitores de caixa (1366×768), com menu lateral adaptável e atalhos de teclado para operação rápida no PDV.

## Demonstração das telas

| Visão geral | Frente de caixa | Pagamento |
|---|---|---|
| ![Dashboard](portfolio/02-dashboard.png) | ![PDV](portfolio/03-pdv.png) | ![Pagamento](portfolio/15-pdv-pagamento.png) |

| Clientes e fiado | Custos pendentes | Contas a pagar |
|---|---|---|
| ![Clientes](portfolio/08-clientes.png) | ![Custos](portfolio/06-custos.png) | ![Contas](portfolio/11-contas-pagar.png) |

| Estoque | Relatórios | Ajustes / gaveta |
|---|---|---|
| ![Estoque](portfolio/07-estoque.png) | ![Relatórios](portfolio/09-relatorios.png) | ![Gaveta](portfolio/17-ajustes-gaveta.png) |

Veja todas as imagens na pasta [`portfolio/`](portfolio/).

## Principais funcionalidades

- **PDV rápido:** busca com debounce, leitor de código de barras como teclado, quantidade `código x N`, carrinho, descontos e pagamentos divididos.
- **Controle de caixa:** abertura com fundo de troco, sangria, suprimento, fechamento com conferência e relatório imprimível.
- **Catálogo e estoque:** códigos/barcodes únicos, categorias, UN/KG, custos, estoque mínimo, validade por lote (FEFO), perdas e consumo interno.
- **Custos:** tela dedicada para produtos sem custo, com importação em lote via planilha Excel/CSV e cálculo de margem em tempo real.
- **Fiado:** limite, prazo, juros e multa por atraso, extrato imprimível, recebimentos parciais e débitos manuais.
- **Compras e fornecedores:** nota com vários produtos, custo médio, lotes e preço sugerido pela margem da categoria.
- **Financeiro:** contas a pagar com calendário, contas a receber, cartões, transferências, DRE gerencial e fluxo de caixa.
- **Relatórios:** vendas por período, categoria, curva ABC, melhores clientes, estoque, validade e exportação PDF/Excel.
- **Segurança:** JWT, BCrypt, CSRF, controle por papel (ADMIN / MANAGER / CASHIER) e auditoria persistente.
- **Atualizações em tempo real:** WebSocket/STOMP com alertas visuais de estoque e validade.

## Iniciar no Windows

Pré-requisito: Docker Desktop em execução. Na primeira vez, o script baixa imagens e dependências.

```powershell
cd C:\Users\fefer\OneDrive\Documentos\sistemajava\retail-pos-java
.\iniciar.bat
```

Ou manualmente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
docker compose up --build -d
```

Abra **http://localhost:3000**.  
Usuário padrão: **admin**. A senha está no arquivo local `.env` (não publique esse arquivo).

- Interface: http://localhost:3000
- Swagger: http://localhost:8080/swagger-ui.html
- OpenAPI JSON: http://localhost:8080/v3/api-docs
- Saúde: http://localhost:8080/actuator/health

Linux/macOS:

```sh
bash scripts/setup.sh
docker compose up --build -d
```

## Primeira venda

1. Entre como admin e confira os produtos de exemplo.
2. Em **Caixa**, informe o fundo de troco e clique em **Abrir caixa**.
3. Abra **Frente de caixa**, digite o código do produto e pressione Enter.
4. Pressione **F9** para abrir o pagamento.
5. Escolha a forma de pagamento, informe o valor recebido e confirme.
6. Finalize a venda e imprima o recibo não fiscal.

## Desenvolvimento local

Requisitos: JDK 17+, Maven 3.9+, Node 22 LTS e PostgreSQL 15.

```sh
cd backend
mvn spring-boot:run

# Outro terminal:
cd frontend
npm ci
npm run dev
```

No modo local, `pg_dump`/`pg_restore` 15 precisam estar no PATH. O Vite encaminha `/api` e `/ws` para `localhost:8080`.

## Testes

```sh
mvn -B -f backend/pom.xml verify

cd frontend
npm ci
npm test -- --coverage
npm run build
npm run e2e
```

O backend usa JUnit 5, MockMvc e Testcontainers com PostgreSQL real. O frontend usa Jest/Testing Library e Cypress com login → venda → recibo contra a API real.

## Estrutura

```text
backend/      Spring Boot, Maven, entidades, serviços, controllers, Flyway e testes
frontend/     React/Vite, MUI, Redux/RTK Query, Chart.js, Jest e Cypress
scripts/      preparação de credenciais e utilitários locais
docs/         arquitetura, contratos, validação e operação
portfolio/    screenshots para apresentação e portfólio
docker-compose.yml
```

## Importar dados do sistema Python

Se você tem o sistema anterior em Python/SQLite, use:

```sh
node scripts/import-python.mjs "/caminho/mercadinho.db" --apply
```

## Observações

- Não inclui emissão fiscal, integração com adquirente/Pix homologado nem envio de e-mail.
- A balança e a gaveta são configuráveis em Ajustes → Equipamentos.
- Dados e marcas mostrados nas screenshots são fictícios, usados apenas para demonstração.

---

Desenvolvido por [Felipe Ferreira dos Reis](https://github.com/FelipeFeerreira).
