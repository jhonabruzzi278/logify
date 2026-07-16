-- ============================================================
-- Logify Seed — Caso de uso real
-- Distribuidora mayorista de abarrotes y bebidas que abastece
-- almacenes y minimarkets de barrio en Santiago de Chile.
--
-- Ejecutar: docker exec -i logify-db psql -U postgres < seed.sql
-- ADVERTENCIA: este script VACÍA los datos operacionales
-- (pedidos, clientes, inventario, ventas, envíos, notificaciones)
-- y los reemplaza por el dataset realista. Los usuarios se
-- conservan (solo se actualizan sus nombres visibles).
-- ============================================================

-- ============================================================
-- 0. USUARIOS: nombres reales del equipo (mismas credenciales)
-- ============================================================
\c orders_db

UPDATE users SET name = 'Andrés Soto'     WHERE username = 'admin';
UPDATE users SET name = 'Marcela Fuentes' WHERE username = 'operaciones';
UPDATE users SET name = 'Patricio Salazar' WHERE username = 'bodega';
UPDATE users SET name = 'Luis Carvajal'   WHERE username = 'transportista';
UPDATE users SET name = 'María González'  WHERE username = 'vendedor1';
UPDATE users SET name = 'Carlos Muñoz'    WHERE username = 'vendedor2';
UPDATE users SET name = 'Camila Torres'   WHERE username = 'soporte';
UPDATE users SET name = 'Rosa Mardones'   WHERE username = 'cliente';

-- ============================================================
-- 1. INVENTARIO: 20 productos reales de abarrotes y bebidas
--    (precio = venta mayorista al almacén; costo = compra)
-- ============================================================
\c inventory_db

TRUNCATE TABLE sales RESTART IDENTITY;
TRUNCATE TABLE inventory RESTART IDENTITY;

INSERT INTO inventory (sku, stock, name, price, cost, category) VALUES
  -- Bebidas (6)
  ('COCA-COLA-2L',        120, 'Coca-Cola Original 2L',            2500, 1900, 'bebidas'),
  ('SPRITE-2L',            96, 'Sprite 2L',                        2300, 1750, 'bebidas'),
  ('FANTA-2L',             84, 'Fanta 2L',                         2300, 1750, 'bebidas'),
  ('AGUA-VITAL-16L',      150, 'Agua Vital sin gas 1,6L',          1200,  800, 'bebidas'),
  ('JUGO-WATTS-1L',        72, 'Jugo Watt''s Durazno 1L',          1500, 1050, 'bebidas'),
  ('CERVEZA-CRISTAL-350', 200, 'Cerveza Cristal lata 350cc',       1300,  950, 'bebidas'),
  -- Galletas (4)
  ('GALLETA-SODA-MCKAY',  140, 'Galletas de Soda McKay 190g',       900,  600, 'galletas'),
  ('GALLETA-TRITON-126',  110, 'Galletas Tritón 126g',              800,  520, 'galletas'),
  ('GALLETA-FRAC-135',     95, 'Galletas Frac Clásica 135g',        850,  550, 'galletas'),
  ('GALLETON-COSTA',       60, 'Galletón Costa Avena 100g',         700,  450, 'galletas'),
  -- Dulces (4)
  ('CHOC-TRENCITO-30',      8, 'Chocolate Trencito 30g',            700,  480, 'dulces'),
  ('CHOC-SAHNE-NUSS-80',   45, 'Chocolate Sahne-Nuss 80g',         1900, 1400, 'dulces'),
  ('SUPER8-24UN',          30, 'Caja Super 8 (24 unidades)',       4500, 3400, 'dulces'),
  ('GOMITAS-AMBROSOLI',     2, 'Gomitas Ambrosoli 130g',           1100,  750, 'dulces'),
  -- Abarrotes (6)
  ('ARROZ-TUCAPEL-1KG',   180, 'Arroz Tucapel Grado 1 1kg',        1800, 1350, 'otros'),
  ('ACEITE-CHEF-900',      90, 'Aceite Vegetal Chef 900ml',        2900, 2300, 'otros'),
  ('AZUCAR-IANSA-1KG',    160, 'Azúcar Iansa 1kg',                 1500, 1150, 'otros'),
  ('FIDEOS-CAROZZI-400',  130, 'Spaghetti Carozzi N°5 400g',       1100,  780, 'otros'),
  ('TE-SUPREMO-20',        75, 'Té Club Supremo 20 bolsitas',      1400,  980, 'otros'),
  ('CONFORT-4UN',          55, 'Papel Higiénico Confort 4 rollos', 2800, 2100, 'otros');

-- ============================================================
-- 2. VENTAS POS de hoy (caja atendida por los vendedores)
-- ============================================================
INSERT INTO sales (sku, quantity, sale_date, sale_group, payment_method, vendor_id, vendor_name, unit_price, total) VALUES
  ('COCA-COLA-2L',        6, NOW() - INTERVAL '6 hours',      'POS-1101', 'cash',     'vendedor1', 'María González', 2500, 15000),
  ('GALLETA-SODA-MCKAY', 10, NOW() - INTERVAL '5 hours 30 minutes', 'POS-1102', 'debit',    'vendedor2', 'Carlos Muñoz',    900,  9000),
  ('ARROZ-TUCAPEL-1KG',   5, NOW() - INTERVAL '5 hours',      'POS-1103', 'cash',     'vendedor1', 'María González', 1800,  9000),
  ('CERVEZA-CRISTAL-350',12, NOW() - INTERVAL '4 hours 15 minutes', 'POS-1104', 'debit',    'vendedor2', 'Carlos Muñoz',   1300, 15600),
  ('CHOC-TRENCITO-30',    8, NOW() - INTERVAL '3 hours 40 minutes', 'POS-1105', 'cash',     'vendedor1', 'María González',  700,  5600),
  ('AGUA-VITAL-16L',      6, NOW() - INTERVAL '3 hours',      'POS-1106', 'transfer', 'vendedor2', 'Carlos Muñoz',   1200,  7200),
  ('ACEITE-CHEF-900',     2, NOW() - INTERVAL '2 hours 20 minutes', 'POS-1107', 'debit',    'vendedor1', 'María González', 2900,  5800),
  ('SUPER8-24UN',         1, NOW() - INTERVAL '1 hour 45 minutes',  'POS-1108', 'cash',     'vendedor2', 'Carlos Muñoz',   4500,  4500),
  ('TE-SUPREMO-20',       3, NOW() - INTERVAL '1 hour',       'POS-1109', 'credit',   'vendedor1', 'María González', 1400,  4200),
  ('FIDEOS-CAROZZI-400',  8, NOW() - INTERVAL '25 minutes',   'POS-1110', 'cash',     'vendedor2', 'Carlos Muñoz',   1100,  8800);

-- ============================================================
-- 3. CLIENTES: 10 almacenes y minimarkets de barrio (RUT válido)
-- ============================================================
\c orders_db

TRUNCATE TABLE orders RESTART IDENTITY;
TRUNCATE TABLE customers RESTART IDENTITY;

INSERT INTO customers (name, phone, address, email, rut, created_at) VALUES
  ('Almacén Doña Rosa',      '+56 9 8452 1173', 'Av. Irarrázaval 4520, Ñuñoa',                'rosa.mardones@gmail.com',      '76.458.210-1', NOW() - INTERVAL '90 days'),
  ('Minimarket El Trébol',   '+56 9 7311 8842', 'Av. Pajaritos 2150, Maipú',                  'eltrebol.maipu@gmail.com',     '77.123.456-9', NOW() - INTERVAL '85 days'),
  ('Almacén San Camilo',     '+56 9 6120 4437', 'Av. Concha y Toro 1863, Puente Alto',        'almacensancamilo@gmail.com',   '76.890.345-K', NOW() - INTERVAL '80 days'),
  ('Botillería La Esquina',  '+56 9 9284 6650', 'Av. Macul 3421, Macul',                      'laesquina.macul@hotmail.com',  '77.345.678-K', NOW() - INTERVAL '72 days'),
  ('Minimarket Los Aromos',  '+56 9 5873 2214', 'Av. Vicuña Mackenna Pte. 6998, La Florida',  'losaromos.lf@gmail.com',       '76.234.567-6', NOW() - INTERVAL '60 days'),
  ('Almacén El Vecino',      '+56 9 4419 7768', 'Av. Grecia 8735, Peñalolén',                 'elvecino.penalolen@gmail.com', '77.567.890-9', NOW() - INTERVAL '55 days'),
  ('Kiosco Santa Ana',       '+56 9 8837 5591', 'Ecuador 4023, Estación Central',             'kioscosantaana@gmail.com',     '76.678.901-3', NOW() - INTERVAL '40 days'),
  ('Minimarket La Portada',  '+56 9 7562 3308', 'Av. Manuel Antonio Matta 581, Quilicura',    'laportada.quilicura@gmail.com','77.012.345-3', NOW() - INTERVAL '30 days'),
  ('Almacén Doña Carmen',    '+56 9 6647 9925', 'Av. Domingo Santa María 3775, Renca',        'carmen.almacen@gmail.com',     '76.543.210-3', NOW() - INTERVAL '21 days'),
  ('Provisiones El Sauce',   '+56 9 9105 4482', 'José Joaquín Pérez 5498, Cerro Navia',       'elsauce.provisiones@gmail.com','77.890.123-4', NOW() - INTERVAL '14 days');

-- ============================================================
-- 4. PEDIDOS: 14 pedidos mayoristas en todos los estados
--    (reposición semanal típica de un almacén de barrio)
-- ============================================================

INSERT INTO orders (id, customer_id, sku, quantity, status, created_at, assigned_to, cancel_reason, client_code) VALUES
  -- Entregados (historial de los últimos días)
  (101, 1, 'COCA-COLA-2L',        24, 'ENTREGADO', NOW() - INTERVAL '4 days',    'transportista@logify.cl', NULL, 'SL-7K2MQ9'),
  (102, 3, 'ARROZ-TUCAPEL-1KG',   30, 'ENTREGADO', NOW() - INTERVAL '3 days',    'transportista@logify.cl', NULL, 'SL-4TB8XN'),
  (103, 5, 'CERVEZA-CRISTAL-350', 48, 'ENTREGADO', NOW() - INTERVAL '2 days',    'transportista@logify.cl', NULL, 'SL-9WF3JD'),
  (104, 7, 'GALLETA-SODA-MCKAY',  20, 'ENTREGADO', NOW() - INTERVAL '1 day',     'transportista@logify.cl', NULL, 'SL-2HR6VL'),
  -- En reparto (camión en ruta ahora)
  (105, 2, 'ACEITE-CHEF-900',     12, 'EN_REPARTO', NOW() - INTERVAL '3 hours',  'transportista@logify.cl', NULL, 'SL-6PC1ZT'),
  (106, 4, 'CERVEZA-CRISTAL-350', 60, 'EN_REPARTO', NOW() - INTERVAL '2 hours',  'transportista@logify.cl', NULL, 'SL-8NJ5KW'),
  (107, 8, 'AZUCAR-IANSA-1KG',    25, 'EN_REPARTO', NOW() - INTERVAL '90 minutes','transportista@logify.cl', NULL, 'SL-3QX7DM'),
  -- En preparación (bodega armando el pedido)
  (108, 6, 'FIDEOS-CAROZZI-400',  40, 'EN_PREPARACION', NOW() - INTERVAL '1 hour',    NULL, NULL, 'SL-5VG9BH'),
  (109, 9, 'JUGO-WATTS-1L',       18, 'EN_PREPARACION', NOW() - INTERVAL '45 minutes', NULL, NULL, 'SL-1LD4SC'),
  (110,10, 'CONFORT-4UN',         15, 'EN_PREPARACION', NOW() - INTERVAL '30 minutes', NULL, NULL, 'SL-0YT8FR'),
  -- Creados (recién ingresados, pendientes de confirmación)
  (111, 1, 'SPRITE-2L',           12, 'CREATED', NOW() - INTERVAL '20 minutes', NULL, NULL, 'SL-7ZA3EP'),
  (112, 5, 'CHOC-SAHNE-NUSS-80',  10, 'CREATED', NOW() - INTERVAL '10 minutes', NULL, NULL, 'SL-4MK6UW'),
  (113, 3, 'TE-SUPREMO-20',       12, 'CREATED', NOW() - INTERVAL '5 minutes',  NULL, NULL, 'SL-9BQ2GN'),
  -- Cancelado (caso real: local cerrado)
  (114, 2, 'GALLETA-TRITON-126',  15, 'CANCELADO', NOW() - INTERVAL '1 day 2 hours', NULL, 'Local cerrado por inventario; el cliente reagendó para la próxima semana', 'SL-6SW0HJ');

SELECT setval('orders_id_seq', 200);

-- ============================================================
-- 5. ENVÍOS: tracking de cada pedido confirmado
-- ============================================================
\c shipping_db

TRUNCATE TABLE shipments RESTART IDENTITY;

INSERT INTO shipments (id, order_id, customer_id, sku, quantity, status, tracking_number, created_at, shipped_at, customer_code, recipient_rut) VALUES
  -- Entregados: validados con código SL + RUT del almacén
  (201, 101, 1, 'COCA-COLA-2L',        24, 'ENTREGADO', 'TRACK-A94F2C1B', NOW() - INTERVAL '4 days',  NOW() - INTERVAL '3 days 20 hours', 'SL-7K2MQ9', '76.458.210-1'),
  (202, 102, 3, 'ARROZ-TUCAPEL-1KG',   30, 'ENTREGADO', 'TRACK-D37E8B60', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '2 days 21 hours', 'SL-4TB8XN', '76.890.345-K'),
  (203, 103, 5, 'CERVEZA-CRISTAL-350', 48, 'ENTREGADO', 'TRACK-5C21A9EF', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '1 day 19 hours',  'SL-9WF3JD', '76.234.567-6'),
  (204, 104, 7, 'GALLETA-SODA-MCKAY',  20, 'ENTREGADO', 'TRACK-B80D4E73', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '18 hours',        'SL-2HR6VL', '76.678.901-3'),
  -- En reparto: camión en ruta
  (205, 105, 2, 'ACEITE-CHEF-900',     12, 'EN_REPARTO', 'TRACK-E162F0A8', NOW() - INTERVAL '3 hours',      NOW() - INTERVAL '2 hours 30 minutes', NULL, NULL),
  (206, 106, 4, 'CERVEZA-CRISTAL-350', 60, 'EN_REPARTO', 'TRACK-79C3BD25', NOW() - INTERVAL '2 hours',      NOW() - INTERVAL '1 hour 30 minutes',  NULL, NULL),
  (207, 107, 8, 'AZUCAR-IANSA-1KG',    25, 'EN_REPARTO', 'TRACK-0F4A6D91', NOW() - INTERVAL '90 minutes',   NOW() - INTERVAL '1 hour',             NULL, NULL),
  -- En preparación: bodega armando
  (208, 108, 6, 'FIDEOS-CAROZZI-400',  40, 'EN_PREPARACION', 'TRACK-C58E17B4', NOW() - INTERVAL '55 minutes', NULL, NULL, NULL),
  (209, 109, 9, 'JUGO-WATTS-1L',       18, 'EN_PREPARACION', 'TRACK-36A0D8F2', NOW() - INTERVAL '40 minutes', NULL, NULL, NULL),
  (210, 110,10, 'CONFORT-4UN',         15, 'EN_PREPARACION', 'TRACK-91B7E5C0', NOW() - INTERVAL '25 minutes', NULL, NULL, NULL);

SELECT setval('shipments_id_seq', 300);

-- ============================================================
-- 6. NOTIFICACIONES: trazabilidad completa de eventos
-- ============================================================
\c notification_db

TRUNCATE TABLE notification_records RESTART IDENTITY;

INSERT INTO notification_records (event_id, order_id, customer_id, stage, status, message, target_audience, source_service, occurred_at, received_at) VALUES
  -- Pedido 101 (Almacén Doña Rosa): ciclo completo
  ('seed-101-created',   101, 1, 'Pedido', 'CREADO',     'Pedido #101 registrado: 24x Coca-Cola Original 2L — Almacén Doña Rosa', 'OPERATOR', 'orders-service',   NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('seed-101-shipped',   101, 1, 'Envío',  'EN_CAMINO',  'Pedido #101 en ruta a Av. Irarrázaval 4520, Ñuñoa. Tracking TRACK-A94F2C1B', 'CLIENT', 'shipping-service', NOW() - INTERVAL '3 days 22 hours', NOW() - INTERVAL '3 days 22 hours'),
  ('seed-101-delivered', 101, 1, 'Envío',  'ENTREGADO',  'Pedido #101 entregado en Almacén Doña Rosa. Recepción validada con RUT', 'CLIENT', 'shipping-service', NOW() - INTERVAL '3 days 20 hours', NOW() - INTERVAL '3 days 20 hours'),
  -- Pedido 102 (Almacén San Camilo)
  ('seed-102-created',   102, 3, 'Pedido', 'CREADO',     'Pedido #102 registrado: 30x Arroz Tucapel Grado 1 1kg — Almacén San Camilo', 'OPERATOR', 'orders-service', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('seed-102-delivered', 102, 3, 'Envío',  'ENTREGADO',  'Pedido #102 entregado en Almacén San Camilo, Puente Alto. Tracking TRACK-D37E8B60', 'CLIENT', 'shipping-service', NOW() - INTERVAL '2 days 21 hours', NOW() - INTERVAL '2 days 21 hours'),
  -- Pedido 103 (Minimarket Los Aromos)
  ('seed-103-created',   103, 5, 'Pedido', 'CREADO',     'Pedido #103 registrado: 48x Cerveza Cristal lata 350cc — Minimarket Los Aromos', 'OPERATOR', 'orders-service', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('seed-103-delivered', 103, 5, 'Envío',  'ENTREGADO',  'Pedido #103 entregado en Minimarket Los Aromos, La Florida. Tracking TRACK-5C21A9EF', 'CLIENT', 'shipping-service', NOW() - INTERVAL '1 day 19 hours', NOW() - INTERVAL '1 day 19 hours'),
  -- Pedido 104 (Kiosco Santa Ana)
  ('seed-104-created',   104, 7, 'Pedido', 'CREADO',     'Pedido #104 registrado: 20x Galletas de Soda McKay 190g — Kiosco Santa Ana', 'OPERATOR', 'orders-service', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('seed-104-delivered', 104, 7, 'Envío',  'ENTREGADO',  'Pedido #104 entregado en Kiosco Santa Ana, Estación Central. Tracking TRACK-B80D4E73', 'CLIENT', 'shipping-service', NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours'),
  -- Pedidos 105-107 en reparto
  ('seed-105-confirmed', 105, 2, 'Pedido', 'CONFIRMADO', 'Pedido #105 confirmado: 12x Aceite Vegetal Chef 900ml — Minimarket El Trébol', 'OPERATOR', 'orders-service', NOW() - INTERVAL '2 hours 50 minutes', NOW() - INTERVAL '2 hours 50 minutes'),
  ('seed-105-shipped',   105, 2, 'Envío',  'EN_CAMINO',  'Pedido #105 en ruta a Av. Pajaritos 2150, Maipú. Tracking TRACK-E162F0A8', 'CLIENT', 'shipping-service', NOW() - INTERVAL '2 hours 30 minutes', NOW() - INTERVAL '2 hours 30 minutes'),
  ('seed-106-confirmed', 106, 4, 'Pedido', 'CONFIRMADO', 'Pedido #106 confirmado: 60x Cerveza Cristal lata 350cc — Botillería La Esquina', 'OPERATOR', 'orders-service', NOW() - INTERVAL '1 hour 50 minutes', NOW() - INTERVAL '1 hour 50 minutes'),
  ('seed-106-shipped',   106, 4, 'Envío',  'EN_CAMINO',  'Pedido #106 en ruta a Av. Macul 3421, Macul. Tracking TRACK-79C3BD25', 'CLIENT', 'shipping-service', NOW() - INTERVAL '1 hour 30 minutes', NOW() - INTERVAL '1 hour 30 minutes'),
  ('seed-107-confirmed', 107, 8, 'Pedido', 'CONFIRMADO', 'Pedido #107 confirmado: 25x Azúcar Iansa 1kg — Minimarket La Portada', 'OPERATOR', 'orders-service', NOW() - INTERVAL '80 minutes', NOW() - INTERVAL '80 minutes'),
  ('seed-107-shipped',   107, 8, 'Envío',  'EN_CAMINO',  'Pedido #107 en ruta a Av. Manuel Antonio Matta 581, Quilicura. Tracking TRACK-0F4A6D91', 'CLIENT', 'shipping-service', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'),
  -- Pedidos 108-110 en preparación
  ('seed-108-confirmed', 108, 6, 'Pedido', 'CONFIRMADO', 'Pedido #108 confirmado: 40x Spaghetti Carozzi N°5 400g — Almacén El Vecino. Bodega preparando', 'OPERATOR', 'orders-service', NOW() - INTERVAL '55 minutes', NOW() - INTERVAL '55 minutes'),
  ('seed-109-confirmed', 109, 9, 'Pedido', 'CONFIRMADO', 'Pedido #109 confirmado: 18x Jugo Watt''s Durazno 1L — Almacén Doña Carmen. Bodega preparando', 'OPERATOR', 'orders-service', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes'),
  ('seed-110-confirmed', 110,10, 'Pedido', 'CONFIRMADO', 'Pedido #110 confirmado: 15x Papel Higiénico Confort 4 rollos — Provisiones El Sauce. Bodega preparando', 'OPERATOR', 'orders-service', NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '25 minutes'),
  -- Pedidos 111-113 recién creados
  ('seed-111-created',   111, 1, 'Pedido', 'CREADO',     'Pedido #111 registrado: 12x Sprite 2L — Almacén Doña Rosa', 'OPERATOR', 'orders-service', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes'),
  ('seed-112-created',   112, 5, 'Pedido', 'CREADO',     'Pedido #112 registrado: 10x Chocolate Sahne-Nuss 80g — Minimarket Los Aromos', 'OPERATOR', 'orders-service', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes'),
  ('seed-113-created',   113, 3, 'Pedido', 'CREADO',     'Pedido #113 registrado: 12x Té Club Supremo 20 bolsitas — Almacén San Camilo', 'OPERATOR', 'orders-service', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'),
  -- Pedido 114 cancelado
  ('seed-114-cancelled', 114, 2, 'Pedido', 'CANCELADO',  'Pedido #114 cancelado: local cerrado por inventario; el cliente reagendó para la próxima semana', 'OPERATOR', 'orders-service', NOW() - INTERVAL '1 day 2 hours', NOW() - INTERVAL '1 day 2 hours');

-- ============================================================
-- Resumen del caso de uso sembrado
-- ============================================================
-- Negocio: distribuidora mayorista de abarrotes y bebidas.
-- Clientes: 10 almacenes/minimarkets de barrio en Santiago (RUT válido).
-- Inventario: 20 productos chilenos reales en 4 categorías
--   (bebidas, galletas, dulces, abarrotes/otros), con 2 productos
--   en stock bajo para mostrar las alertas del dashboard.
-- Pedidos: 14 (4 ENTREGADO, 3 EN_REPARTO, 3 EN_PREPARACION,
--   3 CREATED, 1 CANCELADO) con código de retiro SL-XXXXXX.
-- Envíos: 10 con tracking; los entregados validados con
--   código SL + RUT del receptor.
-- Notificaciones: 21 eventos de trazabilidad (OPERATOR / CLIENT).
-- Ventas POS: 10 ventas de hoy con vendedores y medios de pago.
-- ============================================================
