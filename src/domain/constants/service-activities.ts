export const SERVICE_ACTIVITIES = [
  { code: 'BASIC_CLEANING', name: 'Faxina residencial', description: 'Limpeza geral de pisos, superfícies, cozinha e banheiros.', includedByDefault: true, suggestedMinutes: 0, defaultExtraPrice: 0 },
  { code: 'DISHES', name: 'Lavar louça', description: 'Lavagem da louça disponível no momento do serviço.', includedByDefault: false, suggestedMinutes: 30, defaultExtraPrice: 0 },
  { code: 'LAUNDRY', name: 'Lavar roupas', description: 'Separar e colocar roupas para lavar.', includedByDefault: false, suggestedMinutes: 30, defaultExtraPrice: 0 },
  { code: 'IRONING', name: 'Passar roupas', description: 'Passar as peças combinadas no pedido.', includedByDefault: false, suggestedMinutes: 60, defaultExtraPrice: 0 },
  { code: 'FOLD_AND_STORE', name: 'Dobrar e guardar roupas', description: 'Dobrar e organizar roupas limpas.', includedByDefault: false, suggestedMinutes: 45, defaultExtraPrice: 0 },
  { code: 'COOKING', name: 'Cozinhar', description: 'Preparar refeições previamente combinadas.', includedByDefault: false, suggestedMinutes: 90, defaultExtraPrice: 0 },
  { code: 'CABINETS', name: 'Organizar armários', description: 'Organização interna de armários.', includedByDefault: false, suggestedMinutes: 60, defaultExtraPrice: 0 },
  { code: 'FRIDGE', name: 'Limpar geladeira', description: 'Limpeza interna da geladeira.', includedByDefault: false, suggestedMinutes: 45, defaultExtraPrice: 20 },
  { code: 'OVEN', name: 'Limpar forno', description: 'Limpeza interna do forno.', includedByDefault: false, suggestedMinutes: 45, defaultExtraPrice: 20 },
  { code: 'WINDOWS', name: 'Limpar janelas', description: 'Limpeza de janelas acessíveis e seguras.', includedByDefault: false, suggestedMinutes: 60, defaultExtraPrice: 20 },
] as const;
