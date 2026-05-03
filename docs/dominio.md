# Domínio — Linguagem Ubíqua

---

## Entidades

| Termo                     | Código         | Definição                                                                                                                                                                                                                  |
| ------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ordem de Serviço (OS)** | `OrdemServico` | Documento central que registra o atendimento de um veículo. Possui número sequencial único, vincula cliente e veículo, e percorre um ciclo de vida controlado por uma máquina de estados. É o _aggregate root_ do domínio. |
| **Cliente**               | `Cliente`      | Pessoa física (CPF) ou jurídica (CNPJ) proprietária de veículos cadastrados na oficina.                                                                                                                                    |
| **Veículo**               | `Veiculo`      | Bem pertencente a um cliente, identificado pela placa. Toda OS é aberta para um veículo específico.                                                                                                                        |
| **Serviço**               | `Servico`      | Item do catálogo de serviços que a oficina oferece (ex.: troca de óleo, alinhamento). Possui preço e tempo previsto de execução.                                                                                           |
| **Peça / Insumo**         | `Peca`         | Material de estoque consumido durante a execução de uma OS (ex.: filtro de óleo, pastilha de freio). Possui preço unitário, quantidade em estoque e estoque mínimo.                                                        |
| **Usuário**               | `Usuario`      | Operador do sistema interno. Pode ser Administrador ou Funcionário. Não confundir com _cliente_.                                                                                                                           |

---

## Itens da Ordem de Serviço

| Termo               | Código          | Definição                                                                                                                                             |
| ------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Item de Serviço** | `ItemServicoOS` | Instância de um serviço vinculada a uma OS. Congela o preço do serviço no momento da inclusão e registra o tempo real de execução ao final.           |
| **Item de Peça**    | `ItemPecaOS`    | Instância de uma peça vinculada a uma OS. Congela preço e quantidade no momento da inclusão. A quantidade é deduzida do estoque ao ser adicionada.    |
| **Histórico**       | `HistoricoOS`   | Registro imutável de cada transição de status de uma OS, com status anterior, novo status, observação e timestamp. Funciona como trilha de auditoria. |

---

## Papéis de Usuário

| Termo             | Enum          | Definição                                                                                             |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| **Administrador** | `ADMIN`       | Pode criar usuários e tem acesso total ao sistema.                                                    |
| **Funcionário**   | `FUNCIONARIO` | Opera o dia a dia da oficina — abre OS, avança status, gerencia clientes, veículos, serviços e peças. |

---

## Tipo de Pessoa

| Termo               | Enum       | Definição                                                                                                 |
| ------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| **Pessoa Física**   | `FISICA`   | Cliente identificado por CPF (11 dígitos).                                                                |
| **Pessoa Jurídica** | `JURIDICA` | Cliente identificado por CNPJ (14 dígitos). O tipo é detectado automaticamente pelo tamanho do documento. |

---

## Ciclo de Vida da OS

| Status                   | Enum                   | Significado                                                                                            |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Recebida**             | `RECEBIDA`             | OS criada. Veículo chegou à oficina. Aguarda início do diagnóstico.                                    |
| **Em Diagnóstico**       | `EM_DIAGNOSTICO`       | Mecânico está diagnosticando o problema e montando o orçamento (serviços e peças).                     |
| **Aguardando Aprovação** | `AGUARDANDO_APROVACAO` | Orçamento concluído e enviado ao cliente. Execução bloqueada até aprovação.                            |
| **Em Execução**          | `EM_EXECUCAO`          | Cliente aprovou. Serviços e troca de peças em andamento.                                               |
| **Finalizada**           | `FINALIZADA`           | Todos os serviços concluídos. Veículo pronto para retirada.                                            |
| **Entregue**             | `ENTREGUE`             | Veículo retirado pelo cliente. Estado terminal positivo.                                               |
| **Cancelada**            | `CANCELADA`            | OS encerrada antes da conclusão. Peças reservadas são devolvidas ao estoque. Estado terminal negativo. |

---

## Ações de Negócio

| Termo                | Onde                       | Definição                                                                                                                                                                 |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Avançar Status**   | `avancarStatus()`          | Progride a OS para o único próximo status válido na máquina de estados. Não é possível pular etapas.                                                                      |
| **Reprovar OS**      | `reprovarOS()`             | Ação exclusiva do status `AGUARDANDO_APROVACAO`. O cliente rejeita o orçamento; todas as peças reservadas são devolvidas ao estoque e a OS retorna para `EM_DIAGNOSTICO`. |
| **Cancelar OS**      | `cancelarOS()`             | Encerra a OS prematuramente. Permitido apenas nos status `RECEBIDA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO` e `EM_EXECUCAO`. Devolve peças ao estoque.                  |
| **Consulta Pública** | `consultarStatusPublico()` | Endpoint sem autenticação que permite ao cliente final verificar o status da OS informando número da OS + CPF/CNPJ.                                                       |
| **Adicionar Itens**  | `adicionarItens()`         | Inclui serviços e/ou peças em uma OS ainda nas fases iniciais (`RECEBIDA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`).                                                     |

---

## Objetos de Valor

| Termo              | Validação        | Definição                                                                                                          |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| **CPF**            | `validarCPF()`   | Cadastro de Pessoa Física. 11 dígitos, validado com dígitos verificadores.                                         |
| **CNPJ**           | `validarCNPJ()`  | Cadastro Nacional de Pessoa Jurídica. 14 dígitos, validado com dígitos verificadores.                              |
| **Placa**          | `validarPlaca()` | Identificador do veículo. Aceita formato antigo (`ABC1234`) e Mercosul (`ABC1D23`).                                |
| **Documento**      | `cpfCnpj`        | Termo genérico para CPF ou CNPJ. O tipo de pessoa é inferido automaticamente pelo tamanho.                         |
| **Valor Total**    | `valorTotal`     | Soma dos preços congelados de todos os itens de serviço e itens de peça da OS. Recalculado a cada adição de itens. |
| **Estoque Mínimo** | `estoqueMin`     | Quantidade mínima de uma peça em estoque. Usado como alerta operacional. Não bloqueia vendas.                      |

---

## Regras Invariantes

| Regra                                                                          | Implementação                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------- |
| OS finalizada, entregue ou cancelada não pode ser editada.                     | `ordens.service.ts` → `atualizar()`            |
| Peças só podem ser adicionadas nas fases iniciais da OS.                       | `ordens.service.ts` → `adicionarItens()`       |
| Estoque insuficiente bloqueia a criação/adição de itens com peças.             | `StockError` em `criar()` e `adicionarItens()` |
| A máquina de estados é determinística — cada status tem exatamente um próximo. | `TRANSICOES` em `ordens.service.ts`            |
| Reprovação só é possível no status `AGUARDANDO_APROVACAO`.                     | `ordens.service.ts` → `reprovarOS()`           |
| Os preços dos itens são congelados no momento da inclusão na OS.               | `ItemServicoOS.preco` e `ItemPecaOS.preco`     |
