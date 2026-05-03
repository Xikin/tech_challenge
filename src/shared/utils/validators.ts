export function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === +c[10];
}

export function validarCNPJ(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (s: string, w: number[]) => {
    const sum = s.split("").reduce((a, d, i) => a + +d * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === +c[12] && d2 === +c[13];
}

export function validarPlaca(placa: string): boolean {
  const p = placa.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
}

export function limparDocumento(doc: string): string {
  return doc.replace(/\D/g, "");
}
export function limparPlaca(placa: string): string {
  return placa.replace(/[-\s]/g, "").toUpperCase();
}
export function detectarTipoPessoa(doc: string): "FISICA" | "JURIDICA" {
  return doc.replace(/\D/g, "").length === 11 ? "FISICA" : "JURIDICA";
}
