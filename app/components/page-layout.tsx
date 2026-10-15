import type {ReactNode} from "react";
import {ArrowLeft} from "lucide-react";
import {Link} from "react-router";

import {glassPanel} from "./ui-styles";

type PageShellProps = {
    children: ReactNode; width?: "admin" | "content" | "library";
};
type PageHeaderProps = {
    backLabel?: string;
    backTo?: string;
    description?: ReactNode;
    eyebrow: string;
    home?: boolean;
    title: ReactNode;
    children?: ReactNode;
};
type EmptyStateProps = {
    children: ReactNode; icon?: ReactNode; title?: string;
};

export function EmptyState({children, icon, title}: EmptyStateProps) {
    return (<section
        className={`${glassPanel} grid justify-items-start gap-[9px] p-[22px] text-muted min-[560px]:p-[30px] min-[960px]:p-[38px]`}>
        {icon}
        {title ? <h2 className="m-0 text-[16px] leading-[24px] text-ink">{title}</h2> : null}
        <div className="text-[13px] leading-[20px] [&>p]:m-0">{children}</div>
    </section>);
}

export function RouteErrorState({
    title = "Չհաջողվեց բացել էջը",
    description = "Ստուգիր կապը և փորձիր կրկին։",
}: { title?: string; description?: string }) {
    return (<EmptyState title={title}>
        <p>{description}</p>
        <button
            className="mt-3 min-h-11 cursor-pointer rounded-[12px] border border-[rgb(217_181_111/24%)] bg-[rgb(217_181_111/9%)] px-4 text-[12px] font-bold text-gold-bright"
            type="button"
            onClick={() => window.location.reload()}
        >
            Փորձել կրկին
        </button>
    </EmptyState>);
}

export function PageShell({children, width = "content"}: PageShellProps) {
    const maxWidth = width === "library" ? "max-w-[1180px]" : width === "admin" ? "max-w-[1160px]" : "max-w-[940px]";

    return (<main
        className={`relative mx-auto min-h-svh w-full ${maxWidth} pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+14px)] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+88px)] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+14px)] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[560px]:pr-[calc(var(--tg-content-safe-area-inset-right,0px)+24px)] min-[560px]:pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+100px)] min-[560px]:pl-[calc(var(--tg-content-safe-area-inset-left,0px)+24px)] min-[960px]:pr-[calc(var(--tg-content-safe-area-inset-right,0px)+32px)] min-[960px]:pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+112px)] min-[960px]:pl-[calc(var(--tg-content-safe-area-inset-left,0px)+32px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]`}
    >
        {children}
    </main>);
}

export function PageTitle({title}: { title: ReactNode }) {
    if (typeof title !== "string" || title.length === 0) {
        return title;
    }

    const [firstLetter, ...rest] = Array.from(title);

    return (<>
        <span className="font-trchnatar inline-block align-[0.04em] text-[50px] leading-none font-normal">
            {firstLetter}
        </span>
        <span className="font-noto">{rest.join("")}</span>
    </>);
}

export function PageHeader({backLabel, backTo, children, description, eyebrow, home = false, title}: PageHeaderProps) {
    return (<header
        className="
            flex
            flex-col
            gap-1
            items-center
            justify-center
            text-center
            rounded-[12px]
            overflow-hidden
            px-[2px]
            py-[5px]
            min-[560px]:gap-2
            min-[560px]:px-[6px]
            min-[560px]:pt-[42px]
            min-[560px]:pb-[32px]
            min-[960px]:px-[10px]
            min-[960px]:pt-[52px]
            min-[960px]:pb-[40px]
            min-[1440px]:pt-[60px]
            ">
        {backTo && backLabel ? (<Link
            className="
            w-full
            flex
            justify-start
            min-h-[30px]
            text-[13px]
            gap-[7px]
            px-[2px]
            font-bold
            inline-flex
            items-center
            rounded-[11px]
            text-gold-bright
            no-underline
            transition-colors
            hover:text-ink
            focus-visible:outline-3
            focus-visible:outline-offset-3
            focus-visible:outline-[rgb(217_181_111/42%)]
            "
            to={backTo}
        >
            <ArrowLeft aria-hidden="true" size={17} strokeWidth={2}/>
            {backLabel}
        </Link>) : null}

        <h1 className="
            w-full
            text-[18px]
            font-regular
            text-balance
            leading-9
            max-w-[860px]
            tracking-[-1.2px]
            min-[560px]:text-[42px]
            min-[560px]:leading-[49px]
            min-[960px]:text-[58px]
            min-[960px]:leading-[64px]
            ">
            <PageTitle title={title}/>
        </h1>
        <p className="m-0 text-[8px] font-noto tracking-[1.6px] text-gold min-[960px]:text-[13px]">
            {eyebrow}
        </p>
        {description && (
            <p className="mt-[14px] mb-0 max-w-[650px] text-[15px] leading-[23px] text-muted min-[960px]:text-[16px] min-[960px]:leading-[26px]">
                {description}
            </p>)}
        {children}
    </header>);
}
