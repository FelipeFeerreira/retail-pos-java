describe("Real PostgreSQL checkout", () => {
  it("logs in, adds a scanned product, checks out and shows a printable receipt", () => {
    cy.visit("/");
    cy.get('input[autocomplete="username"]').clear().type("admin");
    cy.get('input[autocomplete="current-password"]').type(
      Cypress.env("ADMIN_PASSWORD"),
      { log: false },
    );
    cy.contains("button", "Entrar no sistema").click();
    cy.contains("Tudo pronto para um bom dia.").should("be.visible");
    cy.contains("a", "Caixa").click();
    cy.contains("h4", "Caixa").should("be.visible");
    cy.contains(/Caixa aberto|Caixa fechado/).should("be.visible");
    cy.get("body").then((body) => {
      if (body.find("button:contains('Abrir caixa')").length) {
        cy.contains("label", "Fundo de troco R$")
          .parent()
          .find("input")
          .type("50");
        cy.contains("button", "Abrir caixa").click();
      }
    });
    cy.contains("Caixa aberto").should("be.visible");
    cy.contains("td", "admin").should("be.visible");
    cy.screenshot("cash-1366x768", { capture: "viewport" });
    cy.contains("a", "Visão geral").click();
    cy.contains("a", "Nova venda").click();
    cy.get('input[placeholder="Ex.: 001 x 3"]').type("001 x 2{enter}");

    cy.contains("button", "Finalizar venda").should("be.enabled").click();
    cy.contains("button", "Confirmar pagamento").click();
    cy.contains("Recibo da venda #").should("be.visible");
    cy.contains("COMPROVANTE NÃO FISCAL").should("be.visible");
    cy.contains("button", "Imprimir recibo").should("be.visible");
    cy.screenshot("receipt-1366x768", { capture: "viewport" });
    cy.contains("button", "Fechar").click();
    cy.contains("Seu próximo atendimento começa aqui").should("be.visible");
  });
  it("opens catalog, customers, reports and settings", () => {
    cy.visit("/");
    cy.get('input[autocomplete="current-password"]').type(
      Cypress.env("ADMIN_PASSWORD"),
      { log: false },
    );
    cy.contains("button", "Entrar no sistema").click();
    for (const [label, title] of [
      ["Caixa", "Caixa"],
      ["Produtos", "Produtos e estoque"],
      ["Estoque", "Estoque"],
      ["Compras", "Compras e produção"],
      ["Financeiro", "Financeiro"],
      ["Clientes e fiado", "Clientes e fiado"],
      ["Relatórios", "Relatórios"],
      ["Ajustes", "Ajustes"],
    ]) {
      cy.contains("a", label).click();
      cy.contains("h4", title).should("be.visible");
    }
    cy.contains("a", "Relatórios").click();
    cy.contains("Análises do período").scrollIntoView().should("be.visible");
    cy.screenshot("analytics-1366x768", { capture: "viewport" });
    cy.contains("a", "Financeiro").click();
    cy.contains("Cartões a receber").should("be.visible");
    cy.screenshot("finance-1366x768", { capture: "viewport" });
    cy.contains("button", "Resultado (DRE)").click();
    cy.contains("= Resultado do período").should("be.visible");
    cy.screenshot("dre-1366x768", { capture: "viewport" });
    cy.contains("a", "Compras").click();
    cy.contains("button", "Margens e preços").click();
    cy.contains("Margem por categoria").should("be.visible");
    cy.screenshot("pricing-1366x768", { capture: "viewport" });
    cy.contains("a", "Estoque").click();
    cy.contains("button", "Perdas").click();
    cy.contains("Registrar perda").should("be.visible");
    cy.screenshot("stock-losses-1366x768", { capture: "viewport" });
    cy.contains("a", "Visão geral").click();
    cy.screenshot("dashboard-1366x768", { capture: "viewport" });
  });
});
