import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Dashboard from '@/pages/Dashboard';
import StaffHome from '@/pages/StaffHome';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function Home() {
  const { loading, me, company, role } = useWorkspace();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me) return <Navigate to="/login" replace />;
  if (!company) return <Navigate to="/setup" replace />;
  if (role === 'staff') return <StaffHome />;
  return <Dashboard />;
}