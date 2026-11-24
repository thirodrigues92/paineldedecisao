import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {mapPeriodTotals,locationKey,validCityCoordinate,PATIENT_BATCH_LIMIT,PATIENT_CALL_DELAY_MS} from './patient-map-rules';
describe('Patient map rules',()=>{
  it('counts distinct production visits/patients and sums the same noncancelled rows',()=>assert.deepEqual(mapPeriodTotals([
    {agendamento_id:1,paciente_id:10,valor:100,grupo_nome:'Cardiologia'},
    {agendamento_id:1,paciente_id:10,valor:50,grupo_nome:'Cardiologia'},
    {agendamento_id:2,paciente_id:10,valor:20,grupo_nome:'Cardiologia'},
    {agendamento_id:3,paciente_id:11,valor:500,situacao:'Cancelado',grupo_nome:null},
    {agendamento_id:4,paciente_id:12,valor:30,grupo_nome:null},
  ]),{atendimentos:3,pacientes:2,valor:200}));
  it('groups accents/case/extra spaces as the same location',()=>assert.equal(locationKey('  SÃO   José  '),locationKey('sao jose')));
  it('discards coordinates beyond 30 km from the patient city',()=>{
    const center={latitude:-17.7975,longitude:-50.9269};
    assert.equal(validCityCoordinate({latitude:-17.79,longitude:-50.92},center),true);
    assert.equal(validCityCoordinate({latitude:-16.68,longitude:-49.25},center),false);
    assert.equal(validCityCoordinate(center,null),false);
  });
  it('limits registration to 300 and spaces calls by 150 ms',()=>{assert.equal(PATIENT_BATCH_LIMIT,300);assert.equal(PATIENT_CALL_DELAY_MS,150);});
});