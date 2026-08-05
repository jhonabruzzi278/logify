import Preloader from "@/components/elements/Preloader"
import { useEffect, useState } from "react"
import "@/styles/globals.css"
import "swiper/css"
import "swiper/css/pagination"

function MyApp({ Component, pageProps }) {
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        setTimeout(() => { setLoading(false) }, 800)
    }, [])
    return (
        <>
            {/* El contenido siempre se renderiza (server y cliente) para que el HTML
                estático generado en build incluya título, meta tags y contenido real.
                El Preloader es solo un overlay visual mientras carga, no reemplaza la página. */}
            <Component {...pageProps} />
            {loading && <Preloader />}
        </>
    )
}
export default MyApp
