import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormDialog, Failure, Heading, Loading } from "../components/Common";
import "../i18n";
test("submits edited values and closes after success", async () => {
  const save = jest.fn().mockResolvedValue(undefined),
    close = jest.fn();
  render(
    <FormDialog
      title="Novo cliente"
      fields={[{ key: "name", label: "Nome", required: true }]}
      onSave={save}
      onClose={close}
    />,
  );
  await userEvent.type(screen.getByLabelText(/Nome/), "Maria");
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ name: "Maria" }));
  expect(close).toHaveBeenCalledTimes(1);
});
test("keeps invalid save open and displays server error", async () => {
  const close = jest.fn();
  render(
    <FormDialog
      title="Editar"
      initial={{ amount: 10 }}
      fields={[{ key: "amount", label: "Valor", type: "number" }]}
      onSave={async () => {
        throw new Error("Limite excedido");
      }}
      onClose={close}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Limite excedido");
  expect(close).not.toHaveBeenCalled();
});
test("cancel does not submit and fields support options", async () => {
  const close = jest.fn(),
    save = jest.fn();
  render(
    <FormDialog
      title="Preferências"
      fields={[
        {
          key: "theme",
          label: "Tema",
          options: [{ value: "light", label: "Claro" }],
        },
      ]}
      initial={{ theme: "light" }}
      onSave={save}
      onClose={close}
    />,
  );
  expect(screen.getByText("Claro")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(close).toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
test("common states are accessible", () => {
  render(
    <>
      <Heading title="Produtos" subtitle="Seu estoque" />
      <Loading />
      <Failure error={new Error()} />
    </>,
  );
  expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
