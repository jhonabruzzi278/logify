#!/bin/sh
set -e

envsubst '${ORDERS_SERVICE_URL} ${INVENTORY_SERVICE_URL} ${SHIPPING_SERVICE_URL} ${NOTIFICATION_SERVICE_URL}' \
  < /etc/nginx/templates/nginx-railway.conf.template \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
