import CookieConsent from "@/components/elements/CookieConsent"
import "@/styles/globals.css"
import "swiper/css"
import "swiper/css/pagination"

function MyApp({ Component, pageProps }) {
    return (
        <>
            <Component {...pageProps} />
            <CookieConsent />
        </>
    )
}
export default MyApp
