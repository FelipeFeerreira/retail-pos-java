// Roda só contra a cópia isolada (porta 3001, banco temporário).
it("contas e boletos", () => {
  cy.visit("/");
  cy.get('input[autocomplete="current-password"]').type("12345678", { log: false });
  cy.contains("button", "Entrar no sistema").click();
  cy.contains("a", "Compras").click();
  cy.contains("button", "Fornecedores").click();
  cy.contains("button", "Novo fornecedor").click();
  cy.get('[role="dialog"] input').first().type("Enel Energia");
  cy.contains('[role="dialog"] button', "Salvar").click();
  cy.contains("Enel Energia").should("be.visible");
  cy.contains("a", "Contas e Boletos").click();
  cy.contains("button", "Nova conta").click();
  cy.contains("label", "Linha digitável").parent().find("input")
    .type("00190.50095 40144.816069 06809.350314 3 37370000000100");
  cy.contains("Boleto válido").should("be.visible");
  cy.contains("label", "Fornecedor / credor").parent().click();
  cy.contains('[role="option"]', "Enel Energia").click();
  cy.contains("label", "Descrição").parent().find("input").type("Energia");
  cy.contains("label", "Valor (R$)").parent().find("input").clear().type("250");
  cy.contains("label", "Vencimento").parent().find("input").clear().type(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  cy.contains("label", "Repetição").parent().click();
  cy.contains('[role="option"]', "Recorrente").click();
  cy.contains("Serão criadas 12 contas").should("be.visible");
  cy.screenshot("bills-form", { capture: "viewport" });
  cy.contains('[role="dialog"] button', "Salvar").click();
  cy.contains("td", "Energia (1/12)").should("be.visible");
  cy.contains("Vence hoje").should("be.visible");
  cy.screenshot("bills-page", { capture: "viewport" });
  cy.contains("tr", "Energia (1/12)").contains("button", "Pagar").click();
  cy.contains('[role="dialog"] button', "Salvar").click();
  cy.contains("tr", "Energia (1/12)").contains("Paga").should("be.visible");
  cy.contains("a", "Visão geral").click();
  cy.contains("Contas e Boletos:").should("not.exist");
});
