import { startTransition, type FormEvent } from "react";

// Com <form action>, o React limpa o formulário depois de salvar e caixinhas/listas voltam
// ao valor antigo na tela (salvar de novo desfaria a mudança). Aqui o envio é manual.
export function submitWithoutReset(dispatch: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => dispatch(form));
  };
}
