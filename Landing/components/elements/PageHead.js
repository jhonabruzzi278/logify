import Head from "next/head"

export default function PageHead({ headTitle }) {
    return (
        <Head>
            <title>{headTitle || "Logify — POS, Inventario y Despachos"}</title>
            <meta name="description" content="Plataforma todo-en-uno para pequeños comercios. POS, inventario, pedidos, despachos y dashboard en un solo lugar." />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.svg" />
        </Head>
    )
}
