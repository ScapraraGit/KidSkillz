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
import { ParentChallenges } from "./pages/parent/Challenges";
import { AdminPortal } from "./pages/admin/AdminPortal";
import { InviteAccept } from "./pages/InviteAccept";
import { CaregiverPin } from "./pages/CaregiverPin";
import { ChildDashboard } from "./pages/child/Dashboard";
import { ChildRewards } from "./pages/child/Rewards";
import { ChildInitiative } from "./pages/child/Initiative";
import { ChildActivity } from "./pages/child/Activity";
import {
  TermsOfService,
  PrivacyPolicy,
  AcceptableUsePolicy,
  ChildSafetyPolicy,
  DmcaPolicy,
} from "./pages/Legal";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import { Pair } from "./pages/Pair";
import { OAuthComplete } from "./pages/OAuthComplete";
import { OAuthSignup } from "./pages/OAuthSignup";
import { BetaWelcome } from "./pages/beta/Welcome";
import { BetaChecklist } from "./pages/beta/Checklist";
import { BetaFeedback } from "./pages/beta/Feedback";

export default function App() {
  const { token, user } = useAuth();

  if (!token || !user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login initialMode="SIGNUP" />} />
        <Route path="/child" element={<Login initialMode="CHILD" />} />
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/caregiver/pin" element={<CaregiverPin />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
        <Route path="/child-safety" element={<ChildSafetyPolicy />} />
        <Route path="/dmca" element={<DmcaPolicy />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/auth/oauth/complete" element={<OAuthComplete />} />
        <Route path="/auth/oauth/signup" element={<OAuthSignup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (user.role === "PARENT" || user.role === "CAREGIVER") {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/parent" replace />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
        <Route path="/child-safety" element={<ChildSafetyPolicy />} />
        <Route path="/dmca" element={<DmcaPolicy />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route element={<AppLayout role="PARENT" />}>
          <Route path="/parent" element={<ParentDashboard />} />
          <Route path="/parent/approvals" element={<ParentApprovals />} />
          <Route path="/parent/tasks" element={<ParentTasks />} />
          <Route path="/parent/rewards" element={<ParentRewards />} />
          <Route path="/parent/children" element={<ParentChildren />} />
          <Route path="/parent/ledger" element={<ParentLedger />} />
          <Route path="/parent/settings" element={<ParentSettings />} />
          <Route path="/parent/members" element={<FamilyMembers />} />
          <Route path="/parent/challenges" element={<ParentChallenges />} />
          {/* Back-compat: old standalone Billing route now redirects into Settings. */}
          <Route path="/parent/billing" element={<Navigate to="/parent/settings#billing" replace />} />
          <Route path="/beta" element={<BetaWelcome />} />
          <Route path="/beta/checklist" element={<BetaChecklist />} />
          <Route path="/beta/feedback" element={<BetaFeedback />} />
          {user.isAdmin && <Route path="/parent/admin" element={<AdminPortal />} />}
        </Route>
        <Route path="*" element={<Navigate to="/parent" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/me" replace />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
      <Route path="/child-safety" element={<ChildSafetyPolicy />} />
      <Route path="/dmca" element={<DmcaPolicy />} />
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
