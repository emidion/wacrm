import type { Metadata } from 'next';
import { RevenuePlanner } from '@/components/planner/revenue-planner';

export const metadata: Metadata = {
  title: 'Revenue Planner',
  description:
    'Parâmetros do mês e Forecast Base em cascata, com meta agressiva e cenários de sensibilidade.',
};

export default function PlannerPage() {
  return <RevenuePlanner />;
}
