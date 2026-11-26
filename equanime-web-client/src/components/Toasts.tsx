import { Toaster } from "@/components/ui/sonner";

// One toaster for the page; any island calls toast() from "sonner".
export default function Toasts() {
	return <Toaster position="bottom-center" closeButton={false} />;
}
