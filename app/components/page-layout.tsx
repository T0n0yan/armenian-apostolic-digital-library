import type {ReactNode} from "react";
import {ArrowLeft, Search} from "lucide-react";
import {Link} from "react-router";

import {glassPanel} from "./ui-styles";

type PageShellProps = {
    children: ReactNode; width?: "admin" | "content" | "library";
};
type PageHeaderProps = {
    backLabel?: string;
    backTo?: string;
    description?: ReactNode;
    /** Small gold line under the title; left out when it would repeat the back button. */
    eyebrow?: string;
    home?: boolean;
    /** Bird-letter (Թռչնագիր) initial, as prayers began in old manuscripts. Only prayers use it. */
    ornate?: boolean;
    /** Show the search shortcut in the header row (off on the search page itself). */
    showSearch?: boolean;
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
        className={`relative mx-auto flex min-h-svh w-full flex-col ${maxWidth} pt-[calc(var(--tg-inset-top,0px)+12px)] pr-[calc(var(--tg-inset-right,0px)+14px)] pb-[calc(var(--tg-inset-bottom,0px)+150px)] pl-[calc(var(--tg-inset-left,0px)+14px)] min-[560px]:pt-[calc(var(--tg-inset-top,0px)+20px)] min-[560px]:pr-[calc(var(--tg-inset-right,0px)+24px)] min-[560px]:pb-[calc(var(--tg-inset-bottom,0px)+100px)] min-[560px]:pl-[calc(var(--tg-inset-left,0px)+24px)] min-[960px]:pr-[calc(var(--tg-inset-right,0px)+32px)] min-[960px]:pb-[calc(var(--tg-inset-bottom,0px)+112px)] min-[960px]:pl-[calc(var(--tg-inset-left,0px)+32px)] min-[1440px]:pt-[calc(var(--tg-inset-top,0px)+26px)]`}
    >
        {children}
        {/* A quiet line at the very bottom of the page, however short the content: it should not draw the eye. */}
        <footer className="mt-auto grid pt-24 justify-items-center gap-1 text-center text-[10.5px] leading-snug text-faint opacity-70">
            <span>© {new Date().getFullYear()} Հոգևոր ժառանգություն։ Բոլոր իրավունքները պաշտպանված են։</span>
            <nav className="flex flex-wrap justify-center gap-x-2" aria-label="Կայքի մասին">
              <Link className="text-faint no-underline hover:underline" to="/mer-masin">Մեր մասին</Link>·
              <Link className="text-faint no-underline hover:underline" to="/kap">Կապ</Link>·
              <Link className="text-faint no-underline hover:underline" to="/privacy">Գաղտնիություն</Link>
            </nav>
        </footer>
    </main>);
}

export function PageTitle({title, ornate = false}: { title: ReactNode; ornate?: boolean }) {
    if (!ornate || typeof title !== "string" || title.length === 0) {
        return <span className="font-noto">{title}</span>;
    }

    const [firstLetter, ...rest] = Array.from(title);

    return (<>
        {/* WebKit leaks the color font's palette into following text unless the glyph gets its own layer. */}
        <span className="font-trchnatar relative isolate inline-block align-[0.04em] text-[1.6em] leading-none font-normal">
            {firstLetter}
        </span>
        <span className="font-noto">{rest.join("")}</span>
    </>);
}

export function HeaderSearchLink() {
    return (<span className="ml-auto flex items-center gap-2"><Link
        className="grid size-9 shrink-0 place-items-center rounded-full border border-glass-border bg-subtle text-gold-bright no-underline transition-colors hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgb(217_181_111/42%)]"
        to="/search"
        aria-label="Որոնում"
        title="Որոնում"
    >
        <Search aria-hidden="true" size={17} strokeWidth={2}/>
    </Link></span>);
}

/** Long titles (whole questions, feast names) get a calmer size instead of filling the screen. */
function titleSize(title: ReactNode) {
    const length = typeof title === "string" ? Array.from(title).length : 0;
    if (length > 90) return "text-[18px] leading-[26px] tracking-[-0.1px] min-[560px]:text-[21px] min-[560px]:leading-[29px]";
    if (length > 50) return "text-[20px] leading-[28px] tracking-[-0.2px] min-[560px]:text-[24px] min-[560px]:leading-[32px]";
    return "text-[22px] leading-[30px] tracking-[-0.4px] min-[560px]:text-[28px] min-[560px]:leading-[36px] min-[960px]:text-[34px] min-[960px]:leading-[42px]";
}

export function PageHeader({backLabel, backTo, children, description, eyebrow, home = false, ornate = false, showSearch = true, title}: PageHeaderProps) {
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
            min-[560px]:pt-[24px]
            min-[560px]:pb-[20px]
            min-[960px]:px-[10px]
            min-[960px]:pt-[30px]
            min-[960px]:pb-[24px]
            min-[1440px]:pt-[34px]
            ">
        {(backTo && backLabel) || (showSearch && !home) ? (<div className="flex w-full items-center gap-2">
            {backTo && backLabel ? (<Link
                className="inline-flex min-h-[30px] min-w-0 items-center gap-[7px] rounded-[11px] px-[2px] text-[13px] font-bold text-gold-bright no-underline transition-colors hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
                to={backTo}
            >
                <ArrowLeft aria-hidden="true" size={17} strokeWidth={2}/>
                <span className="truncate">{backLabel}</span>
            </Link>) : null}
            {showSearch && !home ? <HeaderSearchLink/> : null}
        </div>) : null}

        <h1 className={`w-full font-regular text-balance max-w-[860px] ${titleSize(title)}`}>
            <PageTitle title={title} ornate={ornate}/>
        </h1>
        {eyebrow ? <p className="m-0 text-[8px] font-noto tracking-[1.6px] text-gold min-[960px]:text-[13px]">
            {eyebrow}
        </p> : null}
        {description && (
            <p className="mt-[14px] mb-0 max-w-[650px] text-[15px] leading-[23px] text-muted min-[960px]:text-[16px] min-[960px]:leading-[26px]">
                {description}
            </p>)}
        {children}
    </header>);
}
