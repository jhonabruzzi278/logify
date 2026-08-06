import Layout from "@/components/layout/Layout"

// NOTA INTERNA (no se muestra en el sitio): este texto fue adaptado a partir
// de una plantilla y contiene placeholders [NOMBRE COMPLETO], [RUT] y
// [DOMICILIO] en la sección 1 que deben completarse con los datos reales del
// responsable del tratamiento antes de publicar. Revisar con un abogado
// antes de publicar: este documento no reemplaza asesoría legal.

const SECTIONS = [
    {
        title: "1. Responsable del tratamiento",
        body: (
            <>
                <p>
                    El responsable del tratamiento de los datos personales es{" "}
                    <strong>[NOMBRE COMPLETO]</strong>, RUT <strong>[RUT]</strong>, con domicilio en{" "}
                    <strong>[DOMICILIO]</strong>, Chile.
                </p>
                <p>Correo de contacto y soporte: soporte@logify.cl.</p>
            </>
        ),
    },
    {
        title: "2. Alcance",
        body: (
            <p>
                La presente Política de Privacidad resulta aplicable al tratamiento de datos personales
                realizado en el marco del acceso, registro, uso y operación de Logify, incluyendo el sitio
                web (logify.cl), la plataforma, las funcionalidades, las integraciones, los canales de
                soporte, las comunicaciones y los servicios asociados.
            </p>
        ),
    },
    {
        title: "3. Datos que podemos recopilar",
        body: (
            <>
                <p>Logify podrá recopilar, almacenar, organizar, consultar, usar, analizar, procesar y conservar información de las siguientes categorías:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>datos identificatorios y de contacto;</li>
                    <li>datos de registro, autenticación, acceso y seguridad;</li>
                    <li>datos comerciales, administrativos y operativos;</li>
                    <li>
                        datos vinculados a pedidos, inventario, despachos, ventas POS, clientes y demás
                        funcionalidades disponibles actualmente o que se incorporen en el futuro;
                    </li>
                    <li>datos de clientes, empleados, proveedores y terceros vinculados a operaciones gestionadas mediante la plataforma;</li>
                    <li>datos de navegación, dispositivo, sistema operativo, logs, direcciones IP, identificadores en línea, cookies y eventos de uso;</li>
                    <li>datos provenientes de integraciones, APIs y herramientas conectadas (incluyendo el envío de correos de confirmación y cambios de estado a clientes B2B);</li>
                    <li>comunicaciones, consultas, reclamos y demás interacciones con Logify.</li>
                </ul>
            </>
        ),
    },
    {
        title: "4. Fuente de los datos",
        body: (
            <>
                <p>Los datos podrán ser obtenidos:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>directamente del usuario;</li>
                    <li>cuando el usuario carga, genera, importa o administra información en Logify;</li>
                    <li>mediante proveedores externos vinculados a hosting, correo electrónico, analítica, monitoreo o seguridad;</li>
                    <li>de forma automática a través del uso de la plataforma y de sus servicios asociados.</li>
                </ul>
            </>
        ),
    },
    {
        title: "5. Finalidades del tratamiento",
        body: (
            <>
                <p>Logify podrá tratar los datos para las siguientes finalidades:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>prestar, mantener, administrar, operar y mejorar la plataforma y sus servicios;</li>
                    <li>enviar correos operativos, incluyendo confirmaciones de pedido y notificaciones de cambio de estado a clientes B2B;</li>
                    <li>autenticar usuarios, administrar cuentas, controlar accesos y proteger la seguridad de la plataforma;</li>
                    <li>validar operaciones, prevenir fraude, detectar anomalías y gestionar riesgos;</li>
                    <li>brindar soporte técnico y atención al usuario;</li>
                    <li>personalizar la experiencia dentro de la plataforma;</li>
                    <li>generar reportes, métricas y análisis estadísticos internos;</li>
                    <li>cumplir obligaciones legales, regulatorias, fiscales o contractuales;</li>
                    <li>resguardar evidencia y ejercer o defender derechos e intereses legítimos de Logify.</li>
                </ul>
            </>
        ),
    },
    {
        title: "6. Base de funcionamiento del tratamiento",
        body: (
            <>
                <p>El tratamiento de los datos personales podrá fundarse, según corresponda, en:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>la ejecución de la relación contractual o precontractual con el usuario;</li>
                    <li>el consentimiento del titular, cuando resulte exigible (por ejemplo, cookies analíticas y de marketing);</li>
                    <li>el cumplimiento de obligaciones legales o regulatorias;</li>
                    <li>intereses legítimos vinculados a la seguridad, continuidad y mejora del servicio, en la medida permitida por la normativa aplicable.</li>
                </ul>
            </>
        ),
    },
    {
        title: "7. Conservación de datos",
        body: (
            <p>
                Logify podrá conservar los datos durante el tiempo necesario para cumplir las finalidades
                informadas en esta Política, prestar el servicio, cumplir obligaciones legales o
                contractuales, prevenir fraude y mantener trazabilidad operativa. La baja de la cuenta no
                implica la eliminación automática e inmediata de toda la información vinculada. Vencidos los
                plazos aplicables, los datos podrán ser suprimidos, bloqueados o anonimizados.
            </p>
        ),
    },
    {
        title: "8. Compartición de datos",
        body: (
            <>
                <p>Logify podrá compartir datos con terceros únicamente en la medida necesaria para el funcionamiento, operación, soporte o mejora de la plataforma, incluyendo:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>proveedores de infraestructura, hosting, correo electrónico, monitoreo y seguridad;</li>
                    <li>proveedores de autenticación, verificación y prevención de fraude;</li>
                    <li>asesores profesionales que actúen bajo deberes de confidencialidad;</li>
                    <li>autoridades administrativas o judiciales cuando corresponda por ley.</li>
                </ul>
                <p className="mt-2">Fuera de esos supuestos, Logify no vende datos personales ni los cede a terceros para su comercialización independiente.</p>
            </>
        ),
    },
    {
        title: "9. Seguridad y confidencialidad",
        body: (
            <p>
                Logify adopta medidas técnicas y organizativas razonables para proteger los datos contra
                acceso no autorizado, pérdida, filtración, alteración o divulgación indebida. Toda persona
                que intervenga en el tratamiento de datos asume obligaciones de confidencialidad respecto de
                la información a la que acceda.
            </p>
        ),
    },
    {
        title: "10. Derechos del titular",
        body: (
            <p>
                El titular de los datos podrá ejercer los derechos de acceso, rectificación, actualización y
                supresión, así como los demás derechos que le reconozca la normativa chilena de protección
                de datos personales. Para ejercerlos, deberá enviar una solicitud a soporte@logify.cl,
                acreditando razonablemente su identidad e indicando con claridad el derecho que desea
                ejercer.
            </p>
        ),
    },
    {
        title: "11. Datos de terceros cargados por usuarios",
        body: (
            <p>
                Si un usuario carga en Logify datos personales de clientes, empleados, proveedores o
                terceros, declara y garantiza que cuenta con base legal suficiente para hacerlo. El usuario
                será responsable por la licitud, calidad y pertinencia de los datos que incorpore a la
                plataforma.
            </p>
        ),
    },
    {
        title: "12. Cookies y tecnologías similares",
        body: (
            <>
                <p>Logify utiliza cookies propias y de terceros para el funcionamiento del sitio, la medición de uso y la personalización de publicidad. Distinguimos tres categorías:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li><strong>Necesarias:</strong> gestionan la sesión, la autenticación y la seguridad de la plataforma. No requieren consentimiento por ser indispensables para prestar el servicio y no pueden desactivarse.</li>
                    <li><strong>Analíticas:</strong> Google Analytics/Ads (Google LLC), utilizadas para medir visitas, comportamiento de navegación y rendimiento de campañas publicitarias.</li>
                    <li><strong>Marketing:</strong> Meta Pixel (Meta Platforms, Inc.) y TikTok Pixel (TikTok Inc.), utilizados para medir conversiones y mostrar publicidad relevante en esas plataformas.</li>
                </ul>
            </>
        ),
    },
    {
        title: "13. Consentimiento y gestión de cookies",
        body: (
            <p>
                Al ingresar al sitio, el usuario puede aceptar, rechazar o personalizar el uso de cookies
                analíticas y de marketing mediante el banner de cookies. Las cookies necesarias se activan
                siempre; las analíticas y de marketing solo se activan si el usuario presta su
                consentimiento expreso. El usuario puede modificar o retirar su consentimiento en cualquier
                momento desde el enlace &quot;Preferencias de cookies&quot; disponible en el pie de página. Retirar
                el consentimiento no afecta la licitud del tratamiento realizado con anterioridad. El
                usuario también puede bloquear o eliminar cookies desde la configuración de su navegador, lo
                que podrá afectar el funcionamiento de determinadas partes del sitio.
            </p>
        ),
    },
    {
        title: "14. Cambios a esta política",
        body: (
            <p>
                Logify podrá modificar esta Política de Privacidad en cualquier momento para reflejar
                cambios legales, técnicos u operativos. La versión vigente será la publicada en el sitio. El
                uso continuado de Logify luego de la entrada en vigencia de los cambios implicará la
                aceptación de la política actualizada, en la medida permitida por la normativa aplicable.
            </p>
        ),
    },
    {
        title: "15. Autoridad de control",
        body: (
            <p>
                El tratamiento de datos personales en Chile se rige por la Ley N° 19.628 sobre Protección de
                la Vida Privada y demás normativa aplicable en materia de protección de datos personales.
                Ante cualquier consulta o reclamo, el titular puede contactar primero a soporte@logify.cl y,
                cuando corresponda, dirigirse a la autoridad de protección de datos personales competente en
                Chile.
            </p>
        ),
    },
]

export default function PoliticaDePrivacidad() {
    return (
        <Layout headTitle="Política de Privacidad — Logify">
            <section className="pt-32 pb-20 sm:pt-40 sm:pb-24">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-brand-2">Política de Privacidad de Logify</h1>
                    <p className="mt-2 text-sm text-grey-500">Última actualización: 5 de agosto de 2026</p>

                    <p className="mt-6 text-grey-700 leading-relaxed">
                        En Logify valoramos la privacidad de nuestros usuarios y tratamos la información
                        personal en el marco de la normativa aplicable en Chile. Esta Política de Privacidad
                        describe cómo Logify recopila, utiliza, almacena, comparte, conserva y protege la
                        información de quienes acceden, utilizan o interactúan con la plataforma, el sitio
                        web, las integraciones y los canales de soporte. Al registrarte, acceder o utilizar
                        Logify, reconocés haber leído y comprendido esta Política de Privacidad.
                    </p>

                    <div className="mt-10 space-y-10">
                        {SECTIONS.map((section) => (
                            <div key={section.title}>
                                <h2 className="text-xl font-bold text-brand-2 mb-3">{section.title}</h2>
                                <div className="text-grey-700 leading-relaxed space-y-2">{section.body}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </Layout>
    )
}
