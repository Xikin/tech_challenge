# language: pt
Funcionalidade: Atendimento de uma ordem de serviço coordenado pela saga
  Como oficina
  Quero que abertura, orçamento, aprovação, pagamento e execução avancem juntos entre os serviços
  Para que uma falha em qualquer etapa desfaça o que já foi feito nos outros serviços

  Contexto:
    Dado que a cliente "Ana Souza" tem o veículo "ABC1D23" cadastrado

  Cenário: Fluxo completo, da abertura à entrega
    Quando a oficina abre uma OS para o veículo "ABC1D23" com a descrição "Barulho ao frear"
    Então a OS fica "RECEBIDA"
    E o serviço de execução recebe o comando "execucao.comando.abrir-diagnostico"
    Quando o mecânico inicia o diagnóstico
    Então a OS fica "EM_DIAGNOSTICO"
    Quando o mecânico conclui o diagnóstico com os itens:
      | tipo    | nome                        | quantidade | preco  |
      | SERVICO | Troca de Pastilha de Freio  | 1          | 200.00 |
      | PECA    | Pastilha de Freio Dianteira | 1          | 85.00  |
    Então o billing recebe o comando "billing.comando.gerar-orcamento" com total de 285.00
    Quando o billing gera o orçamento de 285.00
    Então a OS fica "AGUARDANDO_APROVACAO"
    E a cliente recebe um e-mail pedindo a aprovação
    Quando a cliente aprova o orçamento
    Então a OS fica "AGUARDANDO_PAGAMENTO"
    E a cliente recebe o link de pagamento por e-mail
    Quando o Mercado Pago confirma o pagamento de 285.00
    Então a OS fica "AGUARDANDO_EXECUCAO"
    E o serviço de execução recebe o comando "execucao.comando.liberar-execucao"
    Quando o mecânico inicia o reparo
    Então a OS fica "EM_EXECUCAO"
    Quando o mecânico finaliza o reparo
    Então a OS fica "FINALIZADA"
    E a saga termina "CONCLUIDA"
    Quando a oficina entrega o veículo
    Então a OS fica "ENTREGUE"

  Cenário: Cliente reprova o orçamento e a saga desfaz a execução
    Dado uma OS aguardando a aprovação do orçamento de 285.00
    Quando a cliente reprova o orçamento por "Achei caro"
    Então a saga entra em compensação por "Achei caro"
    E o serviço de execução recebe o comando "execucao.comando.cancelar"
    E o billing recebe o comando "billing.comando.cancelar"
    E a OS continua "AGUARDANDO_APROVACAO" enquanto as compensações não terminam
    Quando o serviço de execução confirma o cancelamento devolvendo as peças
    E o billing confirma o cancelamento sem estorno
    Então a OS fica "CANCELADA"
    E a saga termina "COMPENSADA"

  Cenário: Falha na execução depois do pagamento estorna o cliente
    Dado uma OS paga aguardando execução
    Quando o mecânico registra falha por "Pinça de freio trincada"
    Então a saga entra em compensação por "Falha na execução: Pinça de freio trincada"
    E o billing recebe o comando "billing.comando.cancelar"
    Quando o billing confirma o cancelamento com estorno
    E o serviço de execução confirma o cancelamento devolvendo as peças
    Então a OS fica "CANCELADA"
    E a saga termina "COMPENSADA"

  Cenário: Oficina cancela a OS durante o diagnóstico
    Dado uma OS em diagnóstico
    Quando a oficina cancela a OS por "Cliente vendeu o carro"
    Então a saga entra em compensação por "Cliente vendeu o carro"
    E só o serviço de execução precisa compensar
    Quando o serviço de execução confirma o cancelamento devolvendo as peças
    Então a OS fica "CANCELADA"

  Cenário: Evento que chega antes da hora é adiado, não perdido
    Dado uma OS em diagnóstico
    Quando o billing avisa a aprovação antes de o orçamento existir
    Então o evento é devolvido para nova tentativa
    E a OS continua "EM_DIAGNOSTICO"

  Cenário: Mensagem entregue duas vezes é processada uma vez só
    Dado uma OS em diagnóstico
    Quando o mesmo evento de diagnóstico concluído chega duas vezes
    Então o billing recebe 1 comando "billing.comando.gerar-orcamento"
