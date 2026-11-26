import { useEffect, useState } from "react";
import { LogOut, Settings2, ShieldCheck, Files } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { menu } from "../data/copy";

export type Me = { email: string; name: string; admin?: boolean };

export const initials = (name: string, email: string) => {
	const words = (name || email).replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
	return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
};

/** The header's account control: "Entrar" signed out; the person's initials and a menu signed in. */
export default function AccountMenu({ initial }: { initial?: Me | null }) {
	// undefined: still asking; null: signed out. Private pages pass what the server already knows.
	const [me, setMe] = useState<Me | null | undefined>(initial);

	useEffect(() => {
		if (initial !== undefined) return;
		fetch("/api/me")
			.then((reply) => (reply.ok ? (reply.json() as Promise<Me>) : null))
			.then(setMe)
			.catch(() => setMe(null));
	}, [initial]);

	async function signOut() {
		await fetch("/api/conta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => null);
		window.location.assign("/");
	}

	if (me === undefined) return <Skeleton className="size-9 rounded-full" aria-hidden="true" />;
	if (me === null) return <a className="appbar__link" href="/entrar">{menu.signIn}</a>;

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger className="appbar__avatar" aria-label={menu.open(me.name || me.email)}>
				<Avatar className="size-9">
					<AvatarFallback className="bg-primary text-primary-foreground text-[0.8rem] font-semibold tracking-wide">{initials(me.name, me.email)}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="w-64">
				<DropdownMenuLabel className="grid gap-0.5 py-2">
					<span className="truncate text-sm font-semibold">{me.name || me.email}</span>
					<span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild><a href="/analises"><Files />{menu.mine}</a></DropdownMenuItem>
				<DropdownMenuItem asChild><a href="/conta"><Settings2 />{menu.account}</a></DropdownMenuItem>
				{me.admin ? <DropdownMenuItem asChild><a href="/admin"><ShieldCheck />{menu.admin}</a></DropdownMenuItem> : null}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={signOut}><LogOut />{menu.signOut}</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
