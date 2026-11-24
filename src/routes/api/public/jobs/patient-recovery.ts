import {createFileRoute} from '@tanstack/react-router';
import {authenticateCronRequest} from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/jobs/patient-recovery')({server:{handlers:{POST:async({request})=>{
  const refusal=await authenticateCronRequest(request);if(refusal)return refusal;
  const {syncPatientRegistrations}=await import('@/lib/patient-registration.server');
  const {processPatientGeocodes}=await import('@/lib/patient-geocode.server');
  // Scheduled callers have a short HTTP deadline; keep each invocation bounded.
  const patients=await syncPatientRegistrations(10);
  const geocode=await processPatientGeocodes(10,0);
  return Response.json({ok:patients.erros.length===0 && geocode.erros.length===0,patients,geocode});
}}}});