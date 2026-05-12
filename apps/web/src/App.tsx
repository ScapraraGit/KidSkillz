import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/auth";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./pages/Login";
import { Landing } from "./pages/Landing";
import { ParentDashboard } from "./pages/parent/Dashboard";
import { ParentApprovals } from "./pages/parent/Approvals";
import { ParentTasks } from "./pages/parent/Tasks";
import { ParentRewards } from "./pages/parent/Rewards";
import { ParentChildren } from "./pages/parent/Children";
import { ParentLedger } from "./pages/parent/Ledger";
import { ParentSettings } from "./pages/parent/Settings";
import { FamilyMembers } from "./pages/parent/FamilyMembers";
import { InviteAccept } from "./pages/InviteAccept";
import { CaregiverPin } from "./pages/CaregiverPin";
import { ChildDashboard } from "./pages/child/Dashboard";
import { ChildRewards } from "./pages/child/Rewards";
import { ChildInitiative } from "./pages/child/Initiative";
import { ChildActivity } from "./pages/child/Activity";

export default function App() {
  const { token, user } = useAuth();

  if (!token || !user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login initialMode="SIGNUP" />} />
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/caregiver/pin" element={<CaregiverPin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (user.role === "PARENT" || user.role === "CAREGIVER") {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/parent" replace />} />
        <Route element={<AppLayout role="PARENT" />}>
          <Route path="/parent" element={<ParentDashboard />} />
          <Route path="/parent/approvals" element={<ParentApprovals />} />
          <Route path="/parent/tasks" element={<ParentTasks />} />
          <Route path="/parent/rewards" element={<ParentRewards />} />
          <Route path="/parent/children" element={<ParentChildren />} />
          <Route path="/parent/ledger" element={<ParentLedger />} />
          <Route path="/parent/settings" element={<ParentSettings />} />
          <Route path="/parent/members" element={<FamilyMembers />} />
        </Route>
        <Route path="*" element={<Navigate to="/parent" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/me" replace />} />
      <Route element={<AppLayout role="CHILD" />}>
        <Route path="/me" element={<ChildDashboard />} />
        <Route path="/me/rewards" element={<ChildRewards />} />
        <Route path="/me/initiative" element={<ChildInitiative />} />
        <Route path="/me/activity" element={<ChildActivity />} />
      </Route>
      <Route path="*" element={<Navigate to="/me" replace />} />
    </Routes>
  );
}
