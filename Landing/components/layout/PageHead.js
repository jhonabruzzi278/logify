import Head from "next/head"

export default function PageHead({ headTitle }) {
    return (
        <Head>
            <title>{headTitle ? headTitle : "Logify - POS e Inventario para tu Negocio"}</title>
            <meta name="description" content="Logify: plataforma todo-en-uno para pequeños comercios. POS, control de inventario, pedidos, despachos y dashboard en un solo lugar." />
            <link rel="icon" href="/favicon.ico" />
        </Head>
    )
}
