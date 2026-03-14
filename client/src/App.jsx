import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider } from "./UserContext";
import Layout from "./Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProjectDetail from "./pages/ProjectDetail";
import Subscribe from "./pages/Subscribe";
import Referral from "./pages/Referral";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import Store from "./pages/Store";
import Status from "./pages/Status";
import Support from "./pages/Support";

function PrivateRoute({ children }) {
  return localStorage.getItem("bp_token") ? children : <Navigate to="/login" replace />;
}

// Pages that manage their own full-screen layout (no shared Layout wrapper)
const STANDALONE = ["/support", "/projects/"];

function AppLayout({ children }) {
  return (
    <PrivateRoute>
      <UserProvider>
        <Layout>{children}</Layout>
      </UserProvider>
    </PrivateRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"  element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/status" element={<Status />} />

        {/* Full-screen standalone (own header) */}
        <Route path="/support" element={<PrivateRoute><Support /></PrivateRoute>} />
        <Route path="/projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />

        {/* Shell-wrapped pages */}
        <Route path="/" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/subscribe" element={<AppLayout><Subscribe /></AppLayout>} />
        <Route path="/referral"  element={<AppLayout><Referral /></AppLayout>} />
        <Route path="/admin"     element={<AppLayout><Admin /></AppLayout>} />
        <Route path="/account"   element={<AppLayout><Account /></AppLayout>} />
        <Route path="/store"     element={<AppLayout><Store /></AppLayout>} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
