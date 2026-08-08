export default function QuestionShell({ step, total, showBack, onBack, title, hint, onSubmit, children, footer }) {
    return (
        <div className="w-full max-w-lg mx-auto animate-fade-in-up">
            <div className="flex items-center gap-3 mb-8">
                {showBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Volver a la pregunta anterior"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/30 text-white hover:border-brand-1 hover:text-brand-1 transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                ) : (
                    <div className="h-9 w-9 shrink-0" />
                )}
                <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-brand-1 transition-all duration-300"
                        style={{ width: `${Math.round((step / total) * 100)}%` }}
                    />
                </div>
                <span className="shrink-0 text-xs font-semibold text-white/70 tabular-nums">{step}/{total}</span>
            </div>

            <form onSubmit={onSubmit}>
                <h1 className="text-white font-extrabold leading-snug mb-2" style={{ fontSize: "clamp(1.4rem, 3vw, 1.9rem)" }}>
                    {title}
                </h1>
                {hint ? <p className="text-white/70 text-sm mb-6">{hint}</p> : <div className="mb-6" />}

                {children}

                {footer}
            </form>
        </div>
    )
}
