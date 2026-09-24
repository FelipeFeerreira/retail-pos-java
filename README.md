# Retail POS — Java & React

A retail point-of-sale and back-office application covering checkout, inventory, customer credit, purchasing and store finances. The interface is primarily in Brazilian Portuguese.

**Stack:** Java 17 · Spring Boot · React 18 · TypeScript · Material UI · PostgreSQL 15 · Docker Compose

## Engineering highlights

- Server-side pricing and stock validation, split payments, cash-session opening and reconciliation.
- Customer credit limits, partial repayments and configurable charges.
- Batch inventory with first-expiring-first-out allocation, waste tracking, purchasing and production recipes.
- Accounts payable, card receivables, cash flow and bank-statement import.
- JWT authentication, role-based access, CSRF protection, audit records and database migrations.
- WebSocket updates, CSV/XLSX import/export, reports and backup/restore tooling.
- Automated Java integration tests and React component tests; an existing GitHub Actions workflow exercises the application.

## Run locally

Install Docker Desktop with Linux containers, then run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
docker compose up --build -d
```

On Linux/macOS, use `bash scripts/setup.sh` before the same Compose command. Open **http://localhost:3000**. Sign in as `admin` using the generated `ADMIN_PASSWORD` in your local `.env`. Setup preserves existing credentials. The sample catalog is for demonstration; no operational store database is included.

- API documentation: http://localhost:8080/swagger-ui.html
- Health endpoint: http://localhost:8080/actuator/health
- Stop while preserving data: `docker compose down`

## First demo sale

Open a cash session, search for a sample product in the checkout screen, add it to the cart, choose a payment method and complete the sale. Review the resulting stock movement and close the cash session. Receipts are non-fiscal; card and Pix settlement is recorded manually.

## Development and verification

```sh
mvn -B -f backend/pom.xml verify
cd frontend
npm ci
npm test
npm run build
```

Java integration tests require Docker for Testcontainers. Cypress and smoke scripts write transactions: run them only against an isolated test database. See [verification notes](docs/PORTFOLIO_VALIDATION.md) for checks performed during portfolio preparation.

## Structure

| Directory | Responsibility |
| --- | --- |
| `backend/` | REST API, domain services, security, migrations and tests |
| `frontend/` | Checkout, administration screens and UI tests |
| `scripts/` | Environment setup, smoke checks and data migration tools |
| `deploy/` | Optional HTTPS reverse-proxy configuration |

## Scope and limitations

This is a development portfolio project, not a certified fiscal or payment-processing product. Physical scales and printers require their own drivers and hardware validation. Store data, backups, credentials and local certificates are excluded. The related [Python desktop implementation](https://github.com/FelipeFeerreira/retail-pos-python) demonstrates another approach to the same domain.
