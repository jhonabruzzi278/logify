import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useApiQuery } from "@/hooks/use-api-query";
import { adaptShipment } from "@/lib/api-adapters";
import { getMonthlyShipments, getMonthlyShipmentStats, groupShipmentsByDay } from "@/lib/calendar-shipments";
import { cn } from "@/lib/utils";
import type { ApiShipment } from "@/types/api";
import type { Shipment } from "@/types/domain";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: shipments } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days = useMemo(() => {
    const result: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [startPad, daysInMonth]);

  const shipmentsByDay = useMemo(
    () => groupShipmentsByDay(shipments ?? [], year, month),
    [shipments, year, month],
  );

  const today = new Date();
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }

  const monthlyShipments = useMemo(
    () => getMonthlyShipments(shipments ?? [], year, month),
    [shipments, year, month],
  );
  const stats = useMemo(() => getMonthlyShipmentStats(monthlyShipments), [monthlyShipments]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Calendario</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Actividad de envíos</h1>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded border border-[#DCE0E2] bg-white text-[#6B7280] hover:bg-[#F5F7F9]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-bold text-[#112b4a]">
            {MONTHS[month]} {year}
          </span>
          <button type="button" onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded border border-[#DCE0E2] bg-white text-[#6B7280] hover:bg-[#F5F7F9]">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border border-[#DCE0E2] bg-white p-3 text-center">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Este mes</p>
          <p className="mt-1 text-xl font-bold text-[#112b4a]">{stats.total}</p>
        </div>
        <div className="rounded border border-[#DCE0E2] bg-white p-3 text-center">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">En curso</p>
          <p className="mt-1 text-xl font-bold text-[#4EB4A5]">{stats.active}</p>
        </div>
        <div className="rounded border border-[#DCE0E2] bg-white p-3 text-center">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Entregados</p>
          <p className="mt-1 text-xl font-bold text-[#4B98CF]">{stats.delivered}</p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto scroll-x rounded border border-[#DCE0E2] bg-white">
        <div className="min-w-[600px] sm:min-w-0">
          {/* Weekday headers */}
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="border-b border-r border-[#ECEEF0] px-2 py-2.5 text-center text-[0.625rem] font-bold uppercase tracking-[0.92px] text-[#6B7280] last:border-r-0">
                {wd}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayShipments = day ? shipmentsByDay.get(day) ?? [] : [];
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[70px] sm:min-h-[90px] border-b border-r border-[#ECEEF0] p-1 sm:p-1.5 last:border-r-0",
                    !day && "bg-[#F8FAFB]"
                  )}
                >
                  {day && (
                    <>
                      <span className={cn(
                        "inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-xs font-bold",
                        isToday(day) ? "bg-[#4B98CF] text-white" : "text-[#112b4a]"
                      )}>
                        {day}
                      </span>

                      <div className="mt-1 space-y-0.5">
                        {dayShipments.slice(0, 2).map((s) => (
                          <Link
                            key={s.id}
                            to="/shipments"
                            title={`${s.tracking} - ${s.stage}`}
                            className={cn(
                              "flex items-center gap-1 truncate rounded px-0.5 sm:px-1 py-0.5 text-[8px] sm:text-[9px] font-medium",
                              s.stage === "entregado" && "bg-green-50 text-green-600",
                              s.stage === "en_reparto" && "bg-[#4B98CF]/10 text-[#4B98CF]",
                              s.stage === "en_preparacion" && "bg-[#E3AA75]/10 text-[#E3AA75]",
                              s.stage === "cancelado" && "bg-red-50 text-red-500",
                            )}
                          >
                            <Truck className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0" />
                            <span className="truncate hidden sm:inline">{s.tracking}</span>
                          </Link>
                        ))}
                        {dayShipments.length > 2 && (
                          <p className="text-[8px] sm:text-[9px] text-[#6B7280] pl-1">+{dayShipments.length - 2} mas</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Daily detail */}
      <div className="rounded border border-[#DCE0E2] bg-white">
        <div className="border-b border-[#ECEEF0] px-4 py-3">
          <h2 className="text-sm font-bold text-[#112b4a]">Envíos registrados hoy ({today.toLocaleDateString("es-CL")})</h2>
        </div>
        <div className="p-3">
          {shipments?.filter((s) => {
            const d = new Date(s.createdAt ?? s.shippedAt ?? "");
            return isToday(d.getDate()) && d.getMonth() === month && d.getFullYear() === year;
          }).length ? (
            <div className="space-y-2">
              {shipments
                .filter((s) => {
                  const d = new Date(s.createdAt ?? s.shippedAt ?? "");
                  return isToday(d.getDate()) && d.getMonth() === month && d.getFullYear() === year;
                })
                .slice(0, 5)
                .map((s) => (
                  <Link key={s.id} to="/shipments" className="flex items-center justify-between rounded px-3 py-2 hover:bg-[#F5F7F9]">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full",
                        s.stage === "entregado" && "bg-green-50",
                        s.stage === "cancelado" && "bg-red-50",
                        "bg-[#F5F7F9]"
                      )}>
                        <Truck className="h-4 w-4 text-[#4B98CF]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#112b4a]">{s.tracking}</p>
                        <p className="text-xs text-[#6B7280]">Pedido #{s.orderId} | SKU {s.sku}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold",
                      s.stage === "entregado" && "bg-green-50 text-green-600",
                      s.stage === "en_reparto" && "bg-[#4B98CF]/10 text-[#4B98CF]",
                      s.stage === "cancelado" && "bg-red-50 text-red-500",
                    )}>
                      {s.stage === "en_preparacion" ? "Preparación" : s.stage === "en_reparto" ? "En reparto" : s.stage === "entregado" ? "Entregado" : s.stage === "cancelado" ? "Cancelado" : s.stage}
                    </span>
                  </Link>
                ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-[#6B7280]">No hay envíos programados para hoy</p>
          )}
        </div>
      </div>
    </div>
  );
}
