import { useQuery } from '@tanstack/react-query';
import { cyclesApi } from '../../api/client';

interface Props {
  cycleId: string;
  phase: 'kpi_setting' | 'self_eval' | 'mgr_eval';
  isHrAdmin?: boolean;
}

export default function PhaseStatusBanner({ cycleId, phase, isHrAdmin }: Props) {
  const { data: phaseStatus } = useQuery({
    queryKey: ['phase-status', cycleId],
    queryFn: () => cyclesApi.getPhaseStatus(cycleId).then(r => r.data),
    enabled: !!cycleId,
  });

  if (!phaseStatus || isHrAdmin) return null;

  const phaseData = phaseStatus[phase];
  if (!phaseData) return null;

  if (phaseStatus.status !== 'ACTIVE') {
    return (
      <div style={{ padding: '12px 16px', background: '#f3f4f6', borderRadius: 8,
        marginBottom: 16, fontSize: 13, color: '#6b7280',
        border: '1px solid #e5e7eb' }}>
        ⏸ This cycle is not yet active (status: {phaseStatus.status})
      </div>
    );
  }

  if (!phaseData.is_open && !phaseData.is_late) {
    return (
      <div style={{ padding: '12px 16px', background: '#eff6ff', borderRadius: 8,
        marginBottom: 16, fontSize: 13, color: '#1d4ed8',
        border: '1px solid #bfdbfe' }}>
        ⏳ {phaseData.message}
      </div>
    );
  }

  if (phaseData.is_late) {
    return (
      <div style={{ padding: '12px 16px', background: '#fef9c3', borderRadius: 8,
        marginBottom: 16, fontSize: 13, color: '#854d0e',
        border: '1px solid #fde68a' }}>
        ⚠ {phaseData.message}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 8,
      marginBottom: 16, fontSize: 13, color: '#166534',
      border: '1px solid #86efac' }}>
      ✓ {phaseData.message}
    </div>
  );
}
