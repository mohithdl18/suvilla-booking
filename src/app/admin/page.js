
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import AdminDashboard from "@/components/Admin/AdminDashboard";

export const metadata = {
    title: "Admin Dashboard | SU VILLA",
    robots: {
        index: false,
        follow: false,
    },
};

function AdminLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p>Loading admin dashboard...</p>
        </main>
    );
}

async function AuthenticatedAdminDashboard() {
    const authenticated = await isAdminAuthenticated();

    if (!authenticated) {
        redirect("/admin/login");
    }

    return <AdminDashboard />;
}

export default function AdminPage() {
    return (
        <Suspense fallback={<AdminLoading />}>
            <AuthenticatedAdminDashboard />
        </Suspense>
    );
}
