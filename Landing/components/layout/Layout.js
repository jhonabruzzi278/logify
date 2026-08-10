import { useEffect, useState } from "react"
import BackToTop from '../elements/BackToTop'
import Footer from './Footer'
import Header1 from './Header1'
import PageHead from './PageHead'
import Sidebar from './Sidebar'

export default function Layout({ headTitle, description, path, children }) {
    const [scroll, setScroll] = useState(false)
    const [openClass, setOpenClass] = useState('')

    const handleMobileMenuOpen = () => {
        document.body.classList.add("overflow-hidden")
        setOpenClass("sidebar-visible")
    }

    const handleMobileMenuClose = () => {
        setOpenClass("")
        document.body.classList.remove("overflow-hidden")
    }

    useEffect(() => {
        const handleScroll = () => {
            setScroll(window.scrollY > 100)
        }
        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <>
            <PageHead headTitle={headTitle} description={description} path={path} />
            <Header1 scroll={scroll} handleMobileMenuOpen={handleMobileMenuOpen} />
            <Sidebar openClass={openClass} handleMobileMenuClose={handleMobileMenuClose} />
            <main className="min-h-screen">
                {children}
            </main>
            <Footer />
            <BackToTop />
        </>
    )
}
