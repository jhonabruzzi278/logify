export const COUNTRY_CODES = [
    { code: "+56", label: "Chile", example: "9 1234 5678" },
    { code: "+54", label: "Argentina", example: "11 1234-5678" },
    { code: "+51", label: "Perú", example: "912 345 678" },
    { code: "+57", label: "Colombia", example: "300 1234567" },
    { code: "+52", label: "México", example: "55 1234 5678" },
    { code: "+591", label: "Bolivia", example: "71234567" },
    { code: "+593", label: "Ecuador", example: "99 123 4567" },
    { code: "+598", label: "Uruguay", example: "99 123 456" },
    { code: "+595", label: "Paraguay", example: "981 123456" },
    { code: "+34", label: "España", example: "612 34 56 78" },
]

export const PASSWORD_RULES = [
    "Al menos 10 caracteres",
    "Una letra mayúscula y una minúscula",
    "Un número",
    "Un símbolo (por ejemplo: ! @ # $)",
]

export function validatePassword(value = "") {
    return (
        value.length >= 10 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /\d/.test(value) &&
        /[^A-Za-z0-9]/.test(value)
    )
}

const fieldClass = "w-full px-4 py-3.5 border-2 border-grey-300 rounded-xl text-base bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"

export function TextField({ type = "text", value, onChange, placeholder, autoFocus }) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={fieldClass}
        />
    )
}

export function PhoneField({ countryCode, phoneNumber, onCountryChange, onNumberChange, autoFocus }) {
    const active = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0]
    return (
        <div className="flex items-stretch gap-2">
            <select
                value={countryCode}
                onChange={(e) => onCountryChange(e.target.value)}
                className="px-3 border-2 border-grey-300 rounded-xl text-base bg-grey-100 focus:border-brand-1 focus:bg-white outline-none transition-all shrink-0"
                aria-label="Código de país"
            >
                {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                ))}
            </select>
            <input
                type="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(e) => onNumberChange(e.target.value)}
                placeholder={active.example}
                autoFocus={autoFocus}
                className={fieldClass}
            />
        </div>
    )
}

export function PasswordField({ value, onChange, autoFocus }) {
    return (
        <div className="space-y-3">
            <TextField type="password" value={value} onChange={onChange} placeholder="Tu contraseña" autoFocus={autoFocus} />
            <ul className="space-y-1.5 rounded-xl bg-grey-100 px-4 py-3">
                {PASSWORD_RULES.map((rule) => {
                    const met = value ? passwordRuleMet(rule, value) : false
                    return (
                        <li key={rule} className={`flex items-center gap-2 text-xs ${met ? "text-brand-3 font-semibold" : "text-grey-500"}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${met ? "bg-brand-3" : "bg-grey-300"}`} />
                            {rule}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function passwordRuleMet(rule, value) {
    if (rule === PASSWORD_RULES[0]) return value.length >= 10
    if (rule === PASSWORD_RULES[1]) return /[A-Z]/.test(value) && /[a-z]/.test(value)
    if (rule === PASSWORD_RULES[2]) return /\d/.test(value)
    return /[^A-Za-z0-9]/.test(value)
}

export function ChoiceGrid({ options, value, onSelect }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className={`px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                        value === opt
                            ? "border-brand-1 bg-brand-1/15 text-brand-2"
                            : "border-grey-300 bg-grey-100 text-brand-2 hover:border-brand-1/50"
                    }`}
                >
                    {opt}
                </button>
            ))}
        </div>
    )
}

export function MultiChoiceGrid({ options, values, onToggle }) {
    return (
        <div className="grid gap-3">
            {options.map((opt) => {
                const checked = values.includes(opt)
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onToggle(opt)}
                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                            checked
                                ? "border-brand-1 bg-brand-1/15 text-brand-2"
                                : "border-grey-300 bg-grey-100 text-brand-2 hover:border-brand-1/50"
                        }`}
                    >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${checked ? "border-brand-1 bg-brand-1" : "border-grey-300"}`}>
                            {checked && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                        </span>
                        {opt}
                    </button>
                )
            })}
        </div>
    )
}

export function BooleanChoice({ value, onSelect }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {["Sí", "No"].map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onSelect(opt === "Sí")}
                    className={`px-4 py-4 rounded-xl text-base font-bold border-2 transition-all ${
                        value === (opt === "Sí")
                            ? "border-brand-1 bg-brand-1/15 text-brand-2"
                            : "border-grey-300 bg-grey-100 text-brand-2 hover:border-brand-1/50"
                    }`}
                >
                    {opt}
                </button>
            ))}
        </div>
    )
}
