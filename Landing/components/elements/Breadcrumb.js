import Link from "next/link"

export default function Breadcrumb({ items }) {
    return (
        <nav aria-label="Breadcrumb" className="pt-28 pb-4 bg-canvas">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg/50">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-fg/30">/</span>}
                            {item.href ? (
                                <Link href={item.href} className="hover:text-fg transition-colors">{item.label}</Link>
                            ) : (
                                <span aria-current="page" className="text-fg/80 font-medium">{item.label}</span>
                            )}
                        </li>
                    ))}
                </ol>
            </div>
        </nav>
    )
}
