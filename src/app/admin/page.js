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

export default async function AdminPage() {
    const authenticated = await isAdminAuthenticated();

    if (!authenticated) {
        redirect("/admin/login");
    }

    return <AdminDashboard />;
}