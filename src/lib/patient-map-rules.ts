export const PATIENT_BATCH_LIMIT = 300;
export const PATIENT_CALL_DELAY_MS = 150;
export const CITY_RADIUS_KM = 30;
export function locationKey(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}
export function locationName(value: string | null | undefined) {
  const s = (value ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, c => c.toLocaleUpperCase('pt-BR')) : 'Não informado';
}
export function haversine(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}) {
  const rad = (n:number) => n*Math.PI/180;
  const d = Math.sin(rad(b.latitude-a.latitude)/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,d)));
}
export function validCityCoordinate(point: {latitude:number;longitude:number} | null, center: {latitude:number;longitude:number} | null) {
  return !!point && !!center && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude)<=90 && Math.abs(point.longitude)<=180 && haversine(point,center)<=CITY_RADIUS_KM;
}
export type MapProduction = {agendamento_id:number;paciente_id:number|null;paciente_nome?:string|null;prontuario?:string|null;grupo_nome:string|null;valor:number|string|null;situacao?:string|null;convenio_nome?:string|null;convenio_id?:number|null};
export function realMapRows<T extends MapProduction>(rows:T[]) {
  return rows.filter(r=> !['cancelado','cancelada'].includes(locationKey(r.situacao)));
}
export function mapPeriodTotals(rows: MapProduction[]) {
  const real = realMapRows(rows);
  return {atendimentos:new Set(real.map(r=>r.agendamento_id)).size,pacientes:new Set(real.filter(r=>r.paciente_id!=null && r.paciente_id>0).map(r=>r.paciente_id)).size,valor:real.reduce((s,r)=>s+Number(r.valor??0),0)};
}