import calendar
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from backend.database import db_session
from backend.settings import get_all_settings


def get_overview_stats(start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes global trading performance KPIs:
    - Net P&L & Gross P&L & Fees
    - Net Win Rate & Gross Win Rate (before costs)
    - Profit Factor (PF) & Adjusted Win/Loss Ratio
    - Expectancy & Sharpe Ratio per trade
    - Total Trades, Avg Win, Avg Loss, Largest Win, Largest Loss
    """
    query = """
    SELECT
        COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as total_trades,
        MIN(trade_date) as min_trade_date,
        MAX(trade_date) as max_trade_date,
        COALESCE(SUM(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN realized_pnl ELSE 0 END), 0.0) as gross_pnl,
        COALESCE(SUM(ib_commission), 0.0) as total_commissions,
        COALESCE(SUM(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN (realized_pnl - ib_commission) ELSE 0 END), 0.0) as net_pnl,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) > 0 THEN 1 ELSE 0 END), 0) as winning_trades,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) < 0 THEN 1 ELSE 0 END), 0) as losing_trades,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) = 0 THEN 1 ELSE 0 END), 0) as breakeven_trades,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND realized_pnl > 0 THEN 1 ELSE 0 END), 0) as winning_trades_price,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losing_trades_price,
        COALESCE(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) > 0 THEN (realized_pnl - ib_commission) ELSE 0 END), 0.0) as gross_profit,
        COALESCE(ABS(SUM(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) < 0 THEN (realized_pnl - ib_commission) ELSE 0 END)), 0.0) as gross_loss,
        COALESCE(MAX(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) > 0 THEN (realized_pnl - ib_commission) ELSE NULL END), 0.0) as largest_win,
        COALESCE(MIN(CASE WHEN (open_close_indicator = 'C' OR realized_pnl != 0) AND (realized_pnl - ib_commission) < 0 THEN (realized_pnl - ib_commission) ELSE NULL END), 0.0) as largest_loss
    FROM trades
    WHERE 1=1
    """
    params = []
    if start_date:
        query += " AND trade_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND trade_date <= ?"
        params.append(end_date)

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()

        total_trades = row["total_trades"]
        winning_trades = row["winning_trades"]
        losing_trades = row["losing_trades"]
        winning_trades_price = row["winning_trades_price"]
        losing_trades_price = row["losing_trades_price"]
        gross_profit = row["gross_profit"]
        gross_loss = row["gross_loss"]
        net_pnl = row["net_pnl"]
        gross_pnl = row["gross_pnl"]
        commissions = row["total_commissions"]

        # Win Rates
        win_rate = round((winning_trades / total_trades * 100), 2) if total_trades > 0 else 0.0
        gross_win_rate = round((winning_trades_price / total_trades * 100), 1) if total_trades > 0 else 0.0
        profit_factor = (
            round((gross_profit / gross_loss), 2)
            if gross_loss > 0
            else (round(gross_profit, 2) if gross_profit > 0 else 0.0)
        )

        avg_win = (gross_profit / winning_trades) if winning_trades > 0 else 0.0
        avg_loss = (gross_loss / losing_trades) if losing_trades > 0 else 0.0
        realized_rr = round(avg_win / avg_loss, 2) if avg_loss > 0 else (round(avg_win, 2) if avg_win > 0 else 0.0)
        loss_rate_dec = (losing_trades / total_trades) if total_trades > 0 else 0.0
        win_rate_dec = (winning_trades / total_trades) if total_trades > 0 else 0.0

        expectancy = round((win_rate_dec * avg_win) - (loss_rate_dec * avg_loss), 2)

        # Adjusted Win/Loss Ratio
        if loss_rate_dec > 0 and avg_loss > 0:
            adj_win_loss_ratio = round((win_rate_dec * avg_win) / (loss_rate_dec * avg_loss), 2)
        elif avg_loss > 0:
            adj_win_loss_ratio = round(avg_win / avg_loss, 2)
        else:
            adj_win_loss_ratio = round(avg_win, 2) if avg_win > 0 else 0.0

        # Calculate Sharpe Ratio per trade from closed trades in the range
        cursor.execute(
            """
            SELECT symbol, open_close_indicator, quantity, realized_pnl, ib_commission, (realized_pnl - ib_commission) as net_pnl, trade_date, trade_time, trade_date_time
            FROM trades
            WHERE 1=1
            """
            + (" AND trade_date >= ?" if start_date else "")
            + (" AND trade_date <= ?" if end_date else "")
            + """
            ORDER BY trade_date ASC, COALESCE(trade_time, '00:00:00') ASC, id ASC
        """,
            params,
        )
        trade_rows = cursor.fetchall()

        closed_trade_rows = [
            r
            for r in trade_rows
            if (r["open_close_indicator"] or "").upper() == "C"
            or (r["realized_pnl"] is not None and r["realized_pnl"] != 0)
        ]
        sharpe_per_trade = 0.0
        if len(closed_trade_rows) >= 2:
            pnls = [r["net_pnl"] for r in closed_trade_rows]
            mean_val = sum(pnls) / len(pnls)
            var_val = sum((x - mean_val) ** 2 for x in pnls) / (len(pnls) - 1)
            std_val = math.sqrt(var_val) if var_val > 0 else 0.0
            if std_val > 0:
                sharpe_per_trade = round(mean_val / std_val, 2)

        # Compute dynamic holding times and largest win/loss symbol
        win_durations = []
        loss_durations = []
        open_positions: Dict[str, List[datetime]] = {}
        largest_win_sym = ""
        largest_loss_sym = ""
        max_win_val = 0.0
        max_loss_val = 0.0

        for r in trade_rows:
            sym = r["symbol"]
            pnl = r["net_pnl"]
            indicator = (r["open_close_indicator"] or "").upper()
            is_closed = indicator == "C" or (r["realized_pnl"] is not None and r["realized_pnl"] != 0)

            if is_closed:
                if pnl > max_win_val:
                    max_win_val = pnl
                    largest_win_sym = sym
                if pnl < max_loss_val:
                    max_loss_val = pnl
                    largest_loss_sym = sym

            indicator = (r["open_close_indicator"] or "").upper()
            dt_str = r["trade_date_time"] or (f"{r['trade_date']} {r['trade_time']}" if r["trade_time"] else None)
            trade_dt = None
            if dt_str:
                try:
                    trade_dt = datetime.fromisoformat(dt_str.replace("Z", "").replace(" ", "T"))
                except Exception:
                    pass

            if sym and trade_dt:
                if "O" in indicator and "C" not in indicator:
                    if sym not in open_positions:
                        open_positions[sym] = []
                    open_positions[sym].append(trade_dt)
                elif "C" in indicator and sym in open_positions and open_positions[sym]:
                    open_dt = open_positions[sym].pop(0)
                    sec = (trade_dt - open_dt).total_seconds()
                    if sec >= 0:
                        if pnl > 0:
                            win_durations.append(sec)
                        elif pnl < 0:
                            loss_durations.append(sec)

        # Cash summary & Starting Capital
        cash_query = """
            SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0.0) as total_deposits,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0.0) as total_withdrawals
            FROM cash_transactions
            WHERE 1=1
        """
        cash_params = []
        if start_date:
            cash_query += " AND transaction_date >= ?"
            cash_params.append(start_date)
        if end_date:
            cash_query += " AND transaction_date <= ?"
            cash_params.append(end_date)
        cursor.execute(cash_query, cash_params)
        cash_row = cursor.fetchone()
        total_deposits = float(cash_row["total_deposits"] if cash_row else 0.0)
        total_withdrawals = float(cash_row["total_withdrawals"] if cash_row else 0.0)
        net_cash_flow = total_deposits - total_withdrawals

        # Cumulative lifetime capital base (all historical deposits up to end_date)
        lifetime_cash_query = """
            SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0.0) as lifetime_deposits,
                COALESCE(SUM(amount), 0.0) as lifetime_net_flow
            FROM cash_transactions
            WHERE 1=1
        """
        lifetime_params = []
        if end_date:
            lifetime_cash_query += " AND transaction_date <= ?"
            lifetime_params.append(end_date)
        cursor.execute(lifetime_cash_query, lifetime_params)
        lifetime_row = cursor.fetchone()
        lifetime_deposits = float(lifetime_row["lifetime_deposits"] if lifetime_row else 0.0)
        lifetime_net_flow = float(lifetime_row["lifetime_net_flow"] if lifetime_row else 0.0)

        app_settings = get_all_settings()
        starting_capital = float(app_settings.get("starting_capital", 0.0) or 0.0)
        capital_base = starting_capital + (lifetime_deposits if lifetime_deposits > 0 else total_deposits)
        account_balance = starting_capital + lifetime_net_flow + net_pnl
        roi_pct = round((net_pnl / capital_base * 100), 2) if capital_base >= 10.0 else 0.0

        def format_duration(dur_list: List[float]) -> str:
            if not dur_list:
                return "--"
            avg_sec = sum(dur_list) / len(dur_list)
            if avg_sec < 60:
                return f"{int(avg_sec)}s"
            elif avg_sec < 3600:
                return f"{round(avg_sec / 60, 1)}m"
            elif avg_sec < 86400:
                return f"{round(avg_sec / 3600, 1)}h"
            else:
                return f"{round(avg_sec / 86400, 1)}d"

        return {
            "total_trades": total_trades,
            "min_trade_date": row["min_trade_date"],
            "max_trade_date": row["max_trade_date"],
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "breakeven_trades": row["breakeven_trades"],
            "winning_trades_price": winning_trades_price,
            "losing_trades_price": losing_trades_price,
            "win_rate": win_rate,
            "gross_win_rate": gross_win_rate,
            "profit_factor": profit_factor,
            "realized_rr": realized_rr,
            "adj_win_loss_ratio": adj_win_loss_ratio,
            "sharpe_per_trade": sharpe_per_trade,
            "expectancy": expectancy,
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "total_commissions": round(commissions, 2),
            "gross_pnl": round(gross_pnl, 2),
            "net_pnl": round(net_pnl, 2),
            "largest_win": round(row["largest_win"], 2),
            "largest_loss": round(row["largest_loss"], 2),
            "largest_win_symbol": largest_win_sym,
            "largest_loss_symbol": largest_loss_sym,
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "avg_win_hold": format_duration(win_durations),
            "avg_loss_hold": format_duration(loss_durations),
            "starting_capital": round(starting_capital, 2),
            "total_deposits": round(total_deposits, 2),
            "total_withdrawals": round(total_withdrawals, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "capital_base": round(capital_base, 2),
            "account_balance": round(account_balance, 2),
            "roi_pct": roi_pct,
        }


def get_detailed_stats(start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns comprehensive trading statistics:
    - Overview KPIs & Risk/Drawdown metrics
    - Rolling Win Rates (10, 20, 50, 100)
    - Equity curve time series with daily P&L bars
    - Drawdown time series (%)
    - Metric evolution by Day, Week, and Month
    - Performance by Symbol
    - Performance by Tag / Setup / Mistake
    - Performance by Day of Week
    - Performance by Time of Day
    - Asset class and Long/Short breakdown
    """
    overview = get_overview_stats(start_date=start_date, end_date=end_date)

    with db_session() as conn:
        cursor = conn.cursor()

        where_clause = "WHERE 1=1"
        params = []
        if start_date:
            where_clause += " AND trade_date >= ?"
            params.append(start_date)
        if end_date:
            where_clause += " AND trade_date <= ?"
            params.append(end_date)

        # Fetch all trades in chronological order
        cursor.execute(
            f"""
            SELECT
                id, ib_exec_id, trade_id, symbol, description,
                COALESCE(asset_category, 'STK') as asset_category,
                COALESCE(buy_sell, 'BUY') as buy_sell,
                quantity, trade_price, ib_commission, realized_pnl,
                (realized_pnl - ib_commission) as net_pnl,
                trade_date, trade_time, trade_date_time,
                COALESCE(open_close_indicator, 'C') as open_close_indicator,
                COALESCE(order_type, 'MKT') as order_type,
                COALESCE(exchange, 'SMART') as exchange,
                notes
            FROM trades
            {where_clause}
            ORDER BY trade_date ASC, COALESCE(trade_time, '00:00:00') ASC, id ASC
        """,
            params,
        )
        all_trades = [dict(r) for r in cursor.fetchall()]
        closed_trades = [
            t
            for t in all_trades
            if (t.get("open_close_indicator") or "").upper() == "C"
            or (t.get("realized_pnl") is not None and t.get("realized_pnl") != 0)
        ]

        # Compute Streaks from chronological closed trade stream
        max_winning_streak = 0
        current_winning_streak = 0
        max_losing_streak = 0
        current_losing_streak = 0

        for t in closed_trades:
            pnl = t["net_pnl"]
            if pnl > 0:
                current_winning_streak += 1
                current_losing_streak = 0
                if current_winning_streak > max_winning_streak:
                    max_winning_streak = current_winning_streak
            elif pnl < 0:
                current_losing_streak += 1
                current_winning_streak = 0
                if current_losing_streak > max_losing_streak:
                    max_losing_streak = current_losing_streak
            else:
                current_winning_streak = 0
                current_losing_streak = 0

        # Compute Rolling Win Rates for 10, 20, 50, 100 on closed trades
        rolling_win_rate = {}
        for w in [10, 20, 50, 100]:
            w_trades = closed_trades[-w:] if len(closed_trades) >= w else closed_trades
            tot_w = len(w_trades)
            wins_w = sum(1 for t in w_trades if t["net_pnl"] > 0)
            losses_w = sum(1 for t in w_trades if t["net_pnl"] < 0)
            wr_w = round((wins_w / tot_w * 100.0), 1) if tot_w > 0 else 0.0

            prior_trades = closed_trades[-2 * w : -w] if len(closed_trades) >= 2 * w else []
            tot_p = len(prior_trades)
            wins_p = sum(1 for t in prior_trades if t["net_pnl"] > 0)
            wr_p = round((wins_p / tot_p * 100.0), 1) if tot_p > 0 else None
            delta_p = round(wr_w - wr_p, 1) if wr_p is not None else 0.0

            rolling_win_rate[str(w)] = {
                "window": w,
                "win_rate": wr_w,
                "wins": wins_w,
                "losses": losses_w,
                "total": tot_w,
                "prior_win_rate": wr_p,
                "delta": delta_p,
            }

        # Group by Date for Equity Curve, Daily Drawdown & Evolution
        daily_trades_map: Dict[str, List[Dict[str, Any]]] = {}
        for t in all_trades:
            d = t["trade_date"]
            if d not in daily_trades_map:
                daily_trades_map[d] = []
            daily_trades_map[d].append(t)

        sorted_dates = sorted(daily_trades_map.keys())

        equity_curve = []
        drawdown_series = []
        running_cumulative = 0.0
        peak_equity = 0.0
        max_drawdown_amount = 0.0
        max_drawdown_pct = 0.0

        # High watermark & Drawdown calculation
        for d in sorted_dates:
            day_trades = daily_trades_map[d]
            day_closed_trades = [
                t
                for t in day_trades
                if (t.get("open_close_indicator") or "").upper() == "C"
                or (t.get("realized_pnl") is not None and t.get("realized_pnl") != 0)
            ]
            day_pnl = sum(t["net_pnl"] for t in day_closed_trades)
            day_wins = sum(1 for t in day_closed_trades if t["realized_pnl"] > 0)
            day_losses = sum(1 for t in day_closed_trades if t["realized_pnl"] < 0)
            running_cumulative += day_pnl

            if running_cumulative > peak_equity:
                peak_equity = running_cumulative

            dd_amount = running_cumulative - peak_equity  # <= 0
            if dd_amount < max_drawdown_amount:
                max_drawdown_amount = dd_amount

            # Percentage calculation
            capital_base = overview.get("capital_base", 0.0) or 0.0
            if capital_base > 0:
                account_peak = capital_base + peak_equity
                dd_pct = (dd_amount / account_peak) * 100.0 if account_peak > 0 else 0.0
            elif peak_equity > 0:
                dd_pct = (dd_amount / peak_equity) * 100.0
            else:
                basis = overview.get("gross_loss", 0.0) or abs(running_cumulative) or 100.0
                dd_pct = (dd_amount / basis) * 100.0 if basis > 0 else 0.0

            if dd_pct < max_drawdown_pct:
                max_drawdown_pct = dd_pct

            equity_curve.append(
                {
                    "date": d,
                    "pnl": round(day_pnl, 2),
                    "cumulative_pnl": round(running_cumulative, 2),
                    "trades_count": len(day_closed_trades),
                    "wins": day_wins,
                    "losses": day_losses,
                }
            )

            drawdown_series.append(
                {
                    "date": d,
                    "drawdown_amount": round(dd_amount, 2),
                    "drawdown_pct": round(dd_pct, 2),
                    "peak_pnl": round(peak_equity, 2),
                    "cumulative_pnl": round(running_cumulative, 2),
                }
            )

        current_dd_amount = running_cumulative - peak_equity
        capital_base = overview.get("capital_base", 0.0) or 0.0
        if capital_base > 0:
            account_peak = capital_base + peak_equity
            current_dd_pct = (current_dd_amount / account_peak) * 100.0 if account_peak > 0 else 0.0
        elif peak_equity > 0:
            current_dd_pct = (current_dd_amount / peak_equity) * 100.0
        else:
            basis = overview.get("gross_loss", 0.0) or abs(running_cumulative) or 100.0
            current_dd_pct = (current_dd_amount / basis) * 100.0 if basis > 0 else 0.0

        overview.update(
            {
                "max_drawdown_amount": round(max_drawdown_amount, 2),
                "max_drawdown_pct": round(max_drawdown_pct, 2),
                "current_drawdown_amount": round(current_dd_amount, 2),
                "current_drawdown_pct": round(current_dd_pct, 2),
                "longest_losing_streak": max_losing_streak,
                "current_losing_streak": current_losing_streak,
                "longest_winning_streak": max_winning_streak,
                "current_winning_streak": current_winning_streak,
                "avg_trade_pnl": round((overview["net_pnl"] / overview["total_trades"]), 2)
                if overview["total_trades"] > 0
                else 0.0,
            }
        )

        # Metric Evolution Series (Day, Week, Month)
        def build_evolution_series(group_by: str) -> List[Dict[str, Any]]:
            grouped: Dict[str, List[Dict[str, Any]]] = {}
            for t in all_trades:
                dt_str = t["trade_date"]
                try:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d")
                    if group_by == "month":
                        key = dt.strftime("%Y-%m")
                    elif group_by == "week":
                        key = dt.strftime("%Y-W%U")
                    else:
                        key = dt_str
                except Exception:
                    key = dt_str

                if key not in grouped:
                    grouped[key] = []
                grouped[key].append(t)

            series = []
            cum_pnl = 0.0
            for k in sorted(grouped.keys()):
                group_trades = grouped[k]
                closed_group_trades = [
                    t
                    for t in group_trades
                    if (t.get("open_close_indicator") or "").upper() == "C"
                    or (t.get("realized_pnl") is not None and t.get("realized_pnl") != 0)
                ]
                tot = len(closed_group_trades)
                wins = sum(1 for t in closed_group_trades if t["realized_pnl"] > 0)
                losses = sum(1 for t in closed_group_trades if t["realized_pnl"] < 0)
                g_profit = sum(t["realized_pnl"] for t in closed_group_trades if t["realized_pnl"] > 0)
                g_loss = abs(sum(t["realized_pnl"] for t in closed_group_trades if t["realized_pnl"] < 0))
                pnl = sum(t["net_pnl"] for t in closed_group_trades)
                cum_pnl += pnl

                wr = round((wins / tot * 100.0), 1) if tot > 0 else 0.0
                pf = round((g_profit / g_loss), 2) if g_loss > 0 else (round(g_profit, 2) if g_profit > 0 else 0.0)
                a_win = round((g_profit / wins), 2) if wins > 0 else 0.0
                a_loss = round((g_loss / losses), 2) if losses > 0 else 0.0
                rr = round(a_win / a_loss, 2) if a_loss > 0 else (round(a_win, 2) if a_win > 0 else 0.0)
                exp = round(((wins / tot) * a_win) - ((losses / tot) * a_loss), 2) if tot > 0 else 0.0
                avg_pnl_trade = round((pnl / tot), 2) if tot > 0 else 0.0

                series.append(
                    {
                        "period": k,
                        "date": group_trades[0]["trade_date"],
                        "pnl": round(pnl, 2),
                        "cumulative_pnl": round(cum_pnl, 2),
                        "win_rate": wr,
                        "profit_factor": pf,
                        "realized_rr": rr,
                        "avg_win": a_win,
                        "avg_loss": a_loss,
                        "expectancy": exp,
                        "avg_trade_pnl": avg_pnl_trade,
                        "trades_count": tot,
                    }
                )
            return series

        metric_evolution = {
            "day": build_evolution_series("day"),
            "week": build_evolution_series("week"),
            "month": build_evolution_series("month"),
        }

        # 1. Symbol Breakdown
        cursor.execute(
            f"""
            SELECT
                symbol,
                COALESCE(asset_category, 'STK') as category,
                COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN realized_pnl < 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
                COALESCE(SUM(ib_commission), 0.0) as commissions,
                COALESCE(SUM(ABS(quantity)), 0.0) as total_volume
            FROM trades
            {where_clause}
            GROUP BY symbol, asset_category
            ORDER BY net_pnl ASC
        """,
            params,
        )
        symbols = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            symbols.append(
                {
                    "symbol": r["symbol"],
                    "category": r["category"],
                    "trades_count": cnt,
                    "wins": wins,
                    "losses": r["losses"],
                    "win_rate": wr,
                    "net_pnl": round(r["net_pnl"], 2),
                    "commissions": round(r["commissions"], 2),
                    "total_volume": round(r["total_volume"], 0),
                }
            )

        # Match positions to compute duration per trade execution
        open_pos_map: Dict[str, List[datetime]] = {}
        trade_durations: Dict[int, str] = {}

        for t in all_trades:
            sym = t["symbol"]
            indicator = (t.get("open_close_indicator") or "").upper()
            dt_str = t.get("trade_date_time") or (
                f"{t['trade_date']} {t['trade_time']}" if t.get("trade_time") else None
            )
            trade_dt = None
            if dt_str:
                try:
                    trade_dt = datetime.fromisoformat(dt_str.replace("Z", "").replace(" ", "T"))
                except Exception:
                    pass

            dur_label = "Day Trade (<1d)"
            if sym and trade_dt:
                if "O" in indicator and "C" not in indicator:
                    if sym not in open_pos_map:
                        open_pos_map[sym] = []
                    open_pos_map[sym].append(trade_dt)
                elif "C" in indicator and sym in open_pos_map and open_pos_map[sym]:
                    open_dt = open_pos_map[sym].pop(0)
                    sec = (trade_dt - open_dt).total_seconds()
                    if sec < 3600:
                        dur_label = "Scalp (<1h)"
                    elif sec < 86400:
                        dur_label = "Day Trade (<1d)"
                    else:
                        dur_label = "Swing Trade (>1d)"
            trade_durations[t["id"]] = dur_label

        # 2. Tag / Setup / Mistake Breakdown (Custom tags from notes + Derived execution tags)
        tag_map_market: Dict[str, Dict[str, Any]] = {}
        tag_map_local: Dict[str, Dict[str, Any]] = {}

        for t in all_trades:
            is_closed = (t.get("open_close_indicator") or "").upper() == "C" or (
                t.get("realized_pnl") is not None and t.get("realized_pnl") != 0
            )
            if not is_closed:
                continue
            cat = (t.get("asset_category") or "STK").upper()
            if cat == "CASH":
                continue

            notes = t.get("notes") or ""
            tags_base = []
            if notes:
                # Support tag patterns: "Setup: Scalp", "Mistake: Wrong direction", "[tag]", "#tag", comma separated
                chunks = re.split(r"[,;\n\r]+", notes)
                for chunk in chunks:
                    c = chunk.strip()
                    if c:
                        # Clean bracket or hash prefix if simple tag
                        if c.startswith("[") and c.endswith("]"):
                            c = c[1:-1].strip()
                        elif c.startswith("#"):
                            c = c[1:].strip()
                        tags_base.append(c)

            sym = (t.get("symbol") or "").upper()
            price = float(t.get("trade_price") or 0.0)
            t_time = str(t.get("trade_time") or "")[:5]

            # 1. Option Strategy Classification
            if cat == "OPT":
                if sym.endswith(" C") or "CALL" in sym or re.search(r"\d[C]\d", sym):
                    tags_base.append("Option: Call")
                elif sym.endswith(" P") or "PUT" in sym or re.search(r"\d[P]\d", sym):
                    tags_base.append("Option: Put")
                else:
                    tags_base.append("Option Trade")

                t_notes_lower = str(t.get("notes") or "").lower()
                t_time_full = str(t.get("trade_time") or "")
                if price == 0.0 or "16:20" in t_time_full or "expire" in t_notes_lower or "assign" in t_notes_lower:
                    tags_base.append("Option: Expired / Auto-Liquidation")
            elif cat == "STK":
                if 0 < price < 5.0:
                    tags_base.append("Penny Stock (<$5)")
                elif price >= 5.0:
                    tags_base.append("Stock (≥$5)")

            # 2. Market Index / Major ETF
            if any(idx in sym for idx in ["SPY", "QQQ", "IWM", "DIA", "VXX", "UVXY", "TQQQ", "SQQQ"]):
                tags_base.append("Index ETF")

            # 3. Market Session Time
            tag_mkt_time = None
            tag_loc_time = None
            if t_time and ":" in t_time:
                try:
                    parts = t_time.split(":")
                    hh, mm = int(parts[0]), int(parts[1])
                    total_min = hh * 60 + mm
                    if total_min < 9 * 60 + 30:
                        tag_mkt_time = "Pre-Market (<09:30)"
                        tag_loc_time = "Pre-Market (<15:30)"
                    elif total_min <= 10 * 60 + 30:
                        tag_mkt_time = "Market Open (09:30-10:30)"
                        tag_loc_time = "Market Open (15:30-16:30)"
                    elif total_min <= 14 * 60:
                        tag_mkt_time = "Midday (10:30-14:00)"
                        tag_loc_time = "Midday (16:30-20:00)"
                    elif total_min <= 16 * 60:
                        tag_mkt_time = "Power Hour (14:00-16:00)"
                        tag_loc_time = "Power Hour (20:00-22:00)"
                    else:
                        tag_mkt_time = "After Hours (>16:00)"
                        tag_loc_time = "After Hours (>22:00)"
                except Exception:
                    pass

            # Market Tags
            tags_mkt = list(tags_base)
            if tag_mkt_time:
                tags_mkt.append(tag_mkt_time)
            for tag in tags_mkt:
                if tag not in tag_map_market:
                    tag_map_market[tag] = {"tag": tag, "trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0}
                tag_map_market[tag]["trades_count"] += 1
                if t["realized_pnl"] > 0:
                    tag_map_market[tag]["wins"] += 1
                elif t["realized_pnl"] < 0:
                    tag_map_market[tag]["losses"] += 1
                tag_map_market[tag]["net_pnl"] += t["net_pnl"]

            # Local Tags
            tags_loc = list(tags_base)
            if tag_loc_time:
                tags_loc.append(tag_loc_time)
            for tag in tags_loc:
                if tag not in tag_map_local:
                    tag_map_local[tag] = {"tag": tag, "trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0}
                tag_map_local[tag]["trades_count"] += 1
                if t["realized_pnl"] > 0:
                    tag_map_local[tag]["wins"] += 1
                elif t["realized_pnl"] < 0:
                    tag_map_local[tag]["losses"] += 1
                tag_map_local[tag]["net_pnl"] += t["net_pnl"]

        def _format_tags(t_map):
            res = []
            for tag, val in t_map.items():
                cnt = val["trades_count"]
                wr = round((val["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
                res.append(
                    {
                        "tag": tag,
                        "trades_count": cnt,
                        "wins": val["wins"],
                        "losses": val["losses"],
                        "win_rate": wr,
                        "net_pnl": round(val["net_pnl"], 2),
                    }
                )
            res.sort(key=lambda x: x["net_pnl"])
            return res

        tags_market_list = _format_tags(tag_map_market)
        tags_local_list = _format_tags(tag_map_local)

        # 3. Performance by Day of Week (Sun - Sat)
        dow_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        dow_short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        dow_data = {i: {"trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0} for i in range(7)}

        cursor.execute(
            f"""
            SELECT
                strftime('%w', trade_date) as day_of_week,
                COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN realized_pnl < 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as losses
            FROM trades
            {where_clause}
            GROUP BY strftime('%w', trade_date)
        """,
            params,
        )
        for r in cursor.fetchall():
            if r["day_of_week"] is not None:
                idx = int(r["day_of_week"])
                dow_data[idx] = {
                    "trades_count": r["trades_count"],
                    "wins": r["wins"],
                    "losses": r["losses"],
                    "net_pnl": round(r["net_pnl"], 2),
                }

        dow_list = []
        for i in range(7):
            d_info = dow_data[i]
            cnt = d_info["trades_count"]
            wr = round((d_info["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
            dow_list.append(
                {
                    "day_index": i,
                    "day_name": dow_names[i],
                    "short_name": dow_short[i],
                    "trades_count": cnt,
                    "wins": d_info["wins"],
                    "losses": d_info["losses"],
                    "win_rate": wr,
                    "net_pnl": d_info["net_pnl"],
                }
            )

        # 4. Performance by Time of Day (Hourly - Market EST & Local CET)
        ny_tz = ZoneInfo("America/New_York")
        madrid_tz = ZoneInfo("Europe/Madrid")

        hourly_market = {h: {"trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0} for h in range(6, 22)}
        hourly_local = {h: {"trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0} for h in range(8, 24)}

        for t in all_trades:
            is_closed = (t.get("open_close_indicator") or "").upper() == "C" or (
                t.get("realized_pnl") is not None and t.get("realized_pnl") != 0
            )
            tt = t.get("trade_time") or ""
            td = t.get("trade_date") or ""
            h_market = None
            h_local = None

            if tt:
                try:
                    clean_time = tt if len(tt.split(":")) == 3 else f"{tt}:00"
                    dt_obj = datetime.strptime(f"{td} {clean_time}", "%Y-%m-%d %H:%M:%S").replace(tzinfo=ny_tz)
                    h_market = dt_obj.hour
                    h_local = dt_obj.astimezone(madrid_tz).hour
                except Exception:
                    try:
                        h_market = int(tt.split(":")[0])
                        h_local = (h_market + 6) % 24
                    except Exception:
                        pass

            if h_market is not None and h_market in hourly_market:
                if is_closed:
                    hourly_market[h_market]["trades_count"] += 1
                    if t["realized_pnl"] > 0:
                        hourly_market[h_market]["wins"] += 1
                    elif t["realized_pnl"] < 0:
                        hourly_market[h_market]["losses"] += 1
                hourly_market[h_market]["net_pnl"] += t["net_pnl"]

            if h_local is not None and h_local in hourly_local:
                if is_closed:
                    hourly_local[h_local]["trades_count"] += 1
                    if t["realized_pnl"] > 0:
                        hourly_local[h_local]["wins"] += 1
                    elif t["realized_pnl"] < 0:
                        hourly_local[h_local]["losses"] += 1
                hourly_local[h_local]["net_pnl"] += t["net_pnl"]

        time_of_day_market = []
        for h in range(6, 22):
            h_info = hourly_market[h]
            cnt = h_info["trades_count"]
            wr = round((h_info["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
            time_of_day_market.append(
                {
                    "hour": h,
                    "label": f"{h:02d}:00",
                    "market_label": f"{h:02d}:00 EST",
                    "local_label": f"{(h + 6) % 24:02d}:00 CET",
                    "trades_count": cnt,
                    "wins": h_info["wins"],
                    "losses": h_info["losses"],
                    "win_rate": wr,
                    "net_pnl": round(h_info["net_pnl"], 2),
                }
            )

        time_of_day_local = []
        for h in range(8, 24):
            h_info = hourly_local[h]
            cnt = h_info["trades_count"]
            wr = round((h_info["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
            time_of_day_local.append(
                {
                    "hour": h,
                    "label": f"{h:02d}:00",
                    "local_label": f"{h:02d}:00 CET",
                    "market_label": f"{(h - 6) % 24:02d}:00 EST",
                    "trades_count": cnt,
                    "wins": h_info["wins"],
                    "losses": h_info["losses"],
                    "win_rate": wr,
                    "net_pnl": round(h_info["net_pnl"], 2),
                }
            )

        # 5. P&L by Holding Duration (Scalp vs Day Trade vs Swing)
        duration_data: Dict[str, Dict[str, Any]] = {
            "Scalp (<1h)": {"duration": "Scalp (<1h)", "trades_count": 0, "wins": 0, "losses": 0, "net_pnl": 0.0},
            "Day Trade (<1d)": {
                "duration": "Day Trade (<1d)",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
            "Swing Trade (>1d)": {
                "duration": "Swing Trade (>1d)",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
        }
        for t in all_trades:
            is_closed = (t.get("open_close_indicator") or "").upper() == "C" or (
                t.get("realized_pnl") is not None and t.get("realized_pnl") != 0
            )
            dur_key = trade_durations.get(t["id"], "Day Trade (<1d)")
            if dur_key in duration_data:
                if is_closed:
                    duration_data[dur_key]["trades_count"] = int(duration_data[dur_key]["trades_count"]) + 1
                    if t["realized_pnl"] > 0:
                        duration_data[dur_key]["wins"] = int(duration_data[dur_key]["wins"]) + 1
                    elif t["realized_pnl"] < 0:
                        duration_data[dur_key]["losses"] = int(duration_data[dur_key]["losses"]) + 1
                duration_data[dur_key]["net_pnl"] = float(duration_data[dur_key]["net_pnl"]) + float(t["net_pnl"])

        holding_durations = []
        for key in ["Scalp (<1h)", "Day Trade (<1d)", "Swing Trade (>1d)"]:
            d_val = duration_data[key]
            cnt = int(d_val["trades_count"])
            wins = int(d_val["wins"])
            losses = int(d_val["losses"])
            net_pnl = float(d_val["net_pnl"])
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            holding_durations.append(
                {
                    "duration": key,
                    "trades_count": cnt,
                    "wins": wins,
                    "losses": losses,
                    "win_rate": wr,
                    "net_pnl": round(net_pnl, 2),
                }
            )

        # 6. P&L by Order Type (Limit vs Market vs Stop)
        order_type_map = {
            "LMT": "Limit (LMT)",
            "MKT": "Market (MKT)",
            "STP": "Stop (STP)",
            "STP LMT": "Stop Limit (STP LMT)",
        }
        order_data: Dict[str, Dict[str, Any]] = {}
        for t in all_trades:
            is_closed = (t.get("open_close_indicator") or "").upper() == "C" or (
                t.get("realized_pnl") is not None and t.get("realized_pnl") != 0
            )
            ot_raw = (t.get("order_type") or "MKT").upper()
            ot_label = order_type_map.get(ot_raw, f"Order: {ot_raw}")
            if ot_label not in order_data:
                order_data[ot_label] = {
                    "order_type": ot_label,
                    "trades_count": 0,
                    "wins": 0,
                    "losses": 0,
                    "net_pnl": 0.0,
                }
            if is_closed:
                order_data[ot_label]["trades_count"] += 1
                if t["realized_pnl"] > 0:
                    order_data[ot_label]["wins"] += 1
                elif t["realized_pnl"] < 0:
                    order_data[ot_label]["losses"] += 1
            order_data[ot_label]["net_pnl"] += t["net_pnl"]

        # Ensure common types exist
        for ot_raw, ot_label in order_type_map.items():
            if ot_label not in order_data:
                order_data[ot_label] = {
                    "order_type": ot_label,
                    "trades_count": 0,
                    "wins": 0,
                    "losses": 0,
                    "net_pnl": 0.0,
                }

        order_types = []
        for ot_label, val in order_data.items():
            cnt = val["trades_count"]
            wr = round((val["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
            order_types.append(
                {
                    "order_type": ot_label,
                    "trades_count": cnt,
                    "wins": val["wins"],
                    "losses": val["losses"],
                    "win_rate": wr,
                    "net_pnl": round(val["net_pnl"], 2),
                }
            )
        order_types.sort(key=lambda x: x["trades_count"], reverse=True)

        # 7. Asset Category Breakdown
        cursor.execute(
            f"""
            SELECT
                COALESCE(asset_category, 'STK') as category,
                COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl
            FROM trades
            {where_clause}
            GROUP BY asset_category
            ORDER BY net_pnl DESC
        """,
            params,
        )
        categories = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            categories.append(
                {"category": r["category"], "trades_count": cnt, "win_rate": wr, "net_pnl": round(r["net_pnl"], 2)}
            )

        # 8. Buy vs Sell / Long vs Short Position Direction
        side_where = "WHERE asset_category != 'CASH' AND ABS(quantity) > 0.0001"
        if where_clause:
            side_where = f"{where_clause} AND asset_category != 'CASH' AND ABS(quantity) > 0.0001"

        cursor.execute(
            f"""
            SELECT
                CASE 
                    WHEN (open_close_indicator = 'C' AND buy_sell = 'SELL') OR (open_close_indicator = 'O' AND buy_sell = 'BUY') THEN 'LONG'
                    WHEN (open_close_indicator = 'C' AND buy_sell = 'BUY') OR (open_close_indicator = 'O' AND buy_sell = 'SELL') THEN 'SHORT'
                    ELSE buy_sell
                END as side,
                COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl
            FROM trades
            {side_where}
            GROUP BY side
        """,
            params,
        )
        sides = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            sides.append({"side": r["side"], "trades_count": cnt, "win_rate": wr, "net_pnl": round(r["net_pnl"], 2)})

        # 9. Options Strategy Breakdown (Long Call, Long Put, Short Call, Short Put)
        opt_where = "WHERE asset_category = 'OPT' AND (open_close_indicator = 'C' OR realized_pnl != 0) AND ABS(quantity) > 0.0001"
        if where_clause:
            opt_where = f"{where_clause} AND asset_category = 'OPT' AND (open_close_indicator = 'C' OR realized_pnl != 0) AND ABS(quantity) > 0.0001"

        cursor.execute(
            f"""
            SELECT
                symbol,
                buy_sell,
                open_close_indicator,
                realized_pnl,
                ib_commission,
                trade_price,
                trade_time,
                notes
            FROM trades
            {opt_where}
        """,
            params,
        )
        opt_rows = cursor.fetchall()

        opt_stats: Dict[str, Dict[str, Any]] = {
            "long_call": {
                "strategy": "Long Call (Buy Call)",
                "type": "CALL",
                "side": "LONG",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
            "long_put": {
                "strategy": "Long Put (Buy Put)",
                "type": "PUT",
                "side": "LONG",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
            "short_call": {
                "strategy": "Short Call (Sell Call)",
                "type": "CALL",
                "side": "SHORT",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
            "short_put": {
                "strategy": "Short Put (Sell Put)",
                "type": "PUT",
                "side": "SHORT",
                "trades_count": 0,
                "wins": 0,
                "losses": 0,
                "net_pnl": 0.0,
            },
        }

        expired_count = 0
        expired_wins = 0
        expired_losses = 0
        expired_net_pnl = 0.0

        manual_count = 0
        manual_wins = 0
        manual_losses = 0
        manual_net_pnl = 0.0

        for t in opt_rows:
            sym = (t["symbol"] or "").upper()
            is_call = sym.endswith(" C") or "CALL" in sym or re.search(r"\d[C]\d", sym)
            is_put = sym.endswith(" P") or "PUT" in sym or re.search(r"\d[P]\d", sym)

            op_cl = (t["open_close_indicator"] or "C").upper()
            bs = (t["buy_sell"] or "SELL").upper()

            # Closed with SELL -> was LONG; Closed with BUY -> was SHORT
            # Opened with BUY -> is LONG; Opened with SELL -> is SHORT
            is_long = (op_cl == "C" and bs == "SELL") or (op_cl == "O" and bs == "BUY")

            strat_key = None
            if is_call:
                strat_key = "long_call" if is_long else "short_call"
            elif is_put:
                strat_key = "long_put" if is_long else "short_put"

            net = (t["realized_pnl"] or 0.0) - (t["ib_commission"] or 0.0)
            if strat_key:
                opt_stats[strat_key]["trades_count"] += 1
                if (t["realized_pnl"] or 0.0) > 0:
                    opt_stats[strat_key]["wins"] += 1
                elif (t["realized_pnl"] or 0.0) < 0:
                    opt_stats[strat_key]["losses"] += 1
                opt_stats[strat_key]["net_pnl"] += net

            price = float(t["trade_price"] or 0.0)
            time_str = str(t["trade_time"] or "")
            notes_str = str(t["notes"] or "").lower()
            is_expired = price == 0.0 or "16:20" in time_str or "expire" in notes_str or "assign" in notes_str

            if is_expired:
                expired_count += 1
                expired_net_pnl += net
                if (t["realized_pnl"] or 0.0) > 0:
                    expired_wins += 1
                elif (t["realized_pnl"] or 0.0) < 0:
                    expired_losses += 1
            else:
                manual_count += 1
                manual_net_pnl += net
                if (t["realized_pnl"] or 0.0) > 0:
                    manual_wins += 1
                elif (t["realized_pnl"] or 0.0) < 0:
                    manual_losses += 1

        total_opt_count = len(opt_rows)
        options_summary = {
            "total_trades": total_opt_count,
            "expired_count": expired_count,
            "expired_pct": round((expired_count / total_opt_count * 100), 1) if total_opt_count > 0 else 0.0,
            "expired_net_pnl": round(expired_net_pnl, 2),
            "expired_wins": expired_wins,
            "expired_losses": expired_losses,
            "expired_win_rate": round((expired_wins / expired_count * 100), 1) if expired_count > 0 else 0.0,
            "manual_count": manual_count,
            "manual_pct": round((manual_count / total_opt_count * 100), 1) if total_opt_count > 0 else 0.0,
            "manual_net_pnl": round(manual_net_pnl, 2),
            "manual_wins": manual_wins,
            "manual_losses": manual_losses,
            "manual_win_rate": round((manual_wins / manual_count * 100), 1) if manual_count > 0 else 0.0,
        }

        option_strategies = []
        for k, val in opt_stats.items():
            cnt = val["trades_count"]
            wr = round((val["wins"] / cnt * 100), 1) if cnt > 0 else 0.0
            option_strategies.append(
                {
                    "key": k,
                    "strategy": val["strategy"],
                    "type": val["type"],
                    "side": val["side"],
                    "trades_count": cnt,
                    "win_rate": wr,
                    "net_pnl": round(val["net_pnl"], 2),
                }
            )

    return {
        "overview": overview,
        "rolling_win_rate": rolling_win_rate,
        "equity_curve": equity_curve,
        "drawdown_series": drawdown_series,
        "metric_evolution": metric_evolution,
        "symbols": symbols,
        "tags": tags_local_list,
        "tags_local": tags_local_list,
        "tags_market": tags_market_list,
        "day_of_week": dow_list,
        "time_of_day": time_of_day_local,
        "time_of_day_local": time_of_day_local,
        "time_of_day_market": time_of_day_market,
        "holding_durations": holding_durations,
        "order_types": order_types,
        "categories": categories,
        "sides": sides,
        "option_strategies": option_strategies,
        "options_summary": options_summary,
    }


def get_year_calendar(year: int) -> Dict[str, Any]:
    """
    Returns data formatted for the 12-month matrix Year View:
    - Daily records: map of date -> { pnl, count, wins, losses }
    - Monthly sums: array of 12 monthly totals
    - Year total
    """
    year_str = str(year)
    start_date = f"{year_str}-01-01"
    end_date = f"{year_str}-12-31"

    # Daily aggregation query
    query = """
    SELECT
        trade_date,
        COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
        COALESCE(SUM(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN (realized_pnl - ib_commission) ELSE 0 END), 0.0) as net_pnl,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN realized_pnl < 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as losses
    FROM trades
    WHERE trade_date BETWEEN ? AND ?
    GROUP BY trade_date
    """

    daily_map = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (start_date, end_date))
        for row in cursor.fetchall():
            daily_map[row["trade_date"]] = {
                "pnl": round(row["net_pnl"], 2),
                "count": row["trades_count"],
                "wins": row["wins"],
                "losses": row["losses"],
            }

    # Compute 12 monthly sums
    monthly_totals = []
    year_net_pnl = 0.0
    year_trades_count = 0

    for m in range(1, 13):
        m_str = f"{m:02d}"
        m_start = f"{year_str}-{m_str}-01"
        last_day = calendar.monthrange(year, m)[1]
        m_end = f"{year_str}-{m_str}-{last_day:02d}"

        m_pnl = sum(daily_map[d]["pnl"] for d in daily_map if m_start <= d <= m_end)
        m_count = sum(daily_map[d]["count"] for d in daily_map if m_start <= d <= m_end)

        monthly_totals.append({"month": m, "net_pnl": round(m_pnl, 2), "trades_count": m_count})
        year_net_pnl += m_pnl
        year_trades_count += m_count

    return {
        "year": year,
        "daily": daily_map,
        "monthly": monthly_totals,
        "total_net_pnl": round(year_net_pnl, 2),
        "total_trades": year_trades_count,
    }


def get_month_calendar(year: int, month: int) -> Dict[str, Any]:
    """
    Returns data for the Month Grid View:
    - Detailed daily breakdown for every day of the month
    - Total monthly P&L and metrics
    """
    m_str = f"{month:02d}"
    last_day = calendar.monthrange(year, month)[1]
    start_date = f"{year}-{m_str}-01"
    end_date = f"{year}-{m_str}-{last_day:02d}"

    query = """
    SELECT
        trade_date,
        COUNT(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN 1 END) as trades_count,
        COALESCE(SUM(CASE WHEN open_close_indicator = 'C' OR realized_pnl != 0 THEN (realized_pnl - ib_commission) ELSE 0 END), 0.0) as net_pnl,
        COALESCE(SUM(ib_commission), 0.0) as commissions,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN realized_pnl < 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN 1 ELSE 0 END), 0) as losses
    FROM trades
    WHERE trade_date BETWEEN ? AND ?
    GROUP BY trade_date
    """

    daily_map = {}
    month_net_pnl = 0.0
    month_trades_count = 0
    month_wins = 0

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (start_date, end_date))
        for row in cursor.fetchall():
            pnl = round(row["net_pnl"], 2)
            daily_map[row["trade_date"]] = {
                "date": row["trade_date"],
                "pnl": pnl,
                "commissions": round(row["commissions"], 2),
                "count": row["trades_count"],
                "wins": row["wins"],
                "losses": row["losses"],
            }
            month_net_pnl += pnl
            month_trades_count += row["trades_count"]
            month_wins += row["wins"]

        cursor.execute(
            """
            SELECT
                COALESCE(MAX(CASE WHEN (realized_pnl - ib_commission) > 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN (realized_pnl - ib_commission) ELSE NULL END), 0.0) as largest_win,
                COALESCE(MIN(CASE WHEN (realized_pnl - ib_commission) < 0 AND (open_close_indicator = 'C' OR realized_pnl != 0) THEN (realized_pnl - ib_commission) ELSE NULL END), 0.0) as largest_loss
            FROM trades
            WHERE trade_date BETWEEN ? AND ?
        """,
            (start_date, end_date),
        )
        m_ext = cursor.fetchone()
        largest_win = m_ext["largest_win"] if m_ext else 0.0
        largest_loss = m_ext["largest_loss"] if m_ext else 0.0

    # Fill empty days for complete calendar mapping
    days_list = []
    for day in range(1, last_day + 1):
        d_str = f"{year}-{m_str}-{day:02d}"
        if d_str in daily_map:
            days_list.append(daily_map[d_str])
        else:
            days_list.append({"date": d_str, "pnl": 0.0, "commissions": 0.0, "count": 0, "wins": 0, "losses": 0})

    win_rate = round((month_wins / month_trades_count * 100), 1) if month_trades_count > 0 else 0.0

    return {
        "year": year,
        "month": month,
        "start_date": start_date,
        "end_date": end_date,
        "days": days_list,
        "daily_map": daily_map,
        "total_net_pnl": round(month_net_pnl, 2),
        "total_trades": month_trades_count,
        "win_rate": win_rate,
        "largest_win": round(largest_win, 2),
        "largest_loss": round(largest_loss, 2),
    }


def get_week_calendar(target_date_str: str) -> Dict[str, Any]:
    """
    Returns data for the 5-day Trading Week View (Monday to Friday) containing target_date:
    - 5 trading day cards (Mon-Fri) with stats & summary
    """
    try:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except ValueError:
        target_date = date.today()

    # Find Monday (weekday 0) and Friday (weekday 4)
    monday = target_date - timedelta(days=target_date.weekday())
    friday = monday + timedelta(days=4)
    sunday = monday + timedelta(days=6)

    query = """
    SELECT
        id, ib_exec_id, symbol, asset_category, buy_sell, quantity,
        trade_price, realized_pnl, ib_commission, (realized_pnl - ib_commission) as net_pnl,
        trade_date, trade_time, open_close_indicator
    FROM trades
    WHERE trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC, trade_time ASC
    """

    trades_by_date: Dict[str, List[Dict[str, Any]]] = {}
    all_week_trades: List[Dict[str, Any]] = []
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (monday.isoformat(), sunday.isoformat()))
        for row in cursor.fetchall():
            d = row["trade_date"]
            if d not in trades_by_date:
                trades_by_date[d] = []
            trade_dict = dict(row)
            trades_by_date[d].append(trade_dict)
            all_week_trades.append(trade_dict)

    days = []
    week_net_pnl = 0.0
    week_trades_count = 0

    # 5 Trading Days: Monday (0) to Friday (4)
    for i in range(5):
        current_d = monday + timedelta(days=i)
        d_str = current_d.isoformat()
        day_trades = trades_by_date.get(d_str, [])
        closed_day_trades = [
            t
            for t in day_trades
            if (t.get("open_close_indicator") or "").upper() == "C"
            or (t.get("realized_pnl") is not None and t.get("realized_pnl") != 0)
        ]

        day_pnl = sum(t["net_pnl"] for t in closed_day_trades)
        day_wins = sum(1 for t in closed_day_trades if t["realized_pnl"] > 0)
        day_losses = sum(1 for t in closed_day_trades if t["realized_pnl"] < 0)

        days.append(
            {
                "date": d_str,
                "day_number": current_d.day,
                "weekday_index": i,  # 0 = Monday, 4 = Friday
                "pnl": round(day_pnl, 2),
                "trades_count": len(closed_day_trades),
                "wins": day_wins,
                "losses": day_losses,
                "trades": day_trades,
            }
        )
        week_net_pnl += day_pnl
        week_trades_count += len(closed_day_trades)

    closed_week_trades = [
        t
        for t in all_week_trades
        if (t.get("open_close_indicator") or "").upper() == "C"
        or (t.get("realized_pnl") is not None and t.get("realized_pnl") != 0)
    ]
    largest_win = max([t["net_pnl"] for t in closed_week_trades if t["net_pnl"] > 0] or [0.0])
    largest_loss = min([t["net_pnl"] for t in closed_week_trades if t["net_pnl"] < 0] or [0.0])

    return {
        "start_date": monday.isoformat(),
        "end_date": friday.isoformat(),
        "days": days,
        "total_net_pnl": round(week_net_pnl, 2),
        "total_trades": week_trades_count,
        "largest_win": round(largest_win, 2),
        "largest_loss": round(largest_loss, 2),
    }


def format_trade_duration(start_time_str: Optional[str], end_time_str: Optional[str]) -> Optional[str]:
    """Formats the holding time duration between start and end trade times."""
    if not start_time_str or not end_time_str:
        return None
    try:
        t1 = datetime.strptime(start_time_str.strip()[:8], "%H:%M:%S")
        t2 = datetime.strptime(end_time_str.strip()[:8], "%H:%M:%S")
        diff_sec = int((t2 - t1).total_seconds())
        if diff_sec < 0:
            diff_sec += 86400  # Crossed midnight
        hrs = diff_sec // 3600
        mins = (diff_sec % 3600) // 60
        secs = diff_sec % 60
        if hrs > 0:
            return f"{hrs}h {mins:02d}m {secs:02d}s"
        elif mins > 0:
            return f"{mins}m {secs:02d}s"
        else:
            return f"{secs}s"
    except Exception:
        return None


def detect_option_type(symbol: str, asset_category: str = "") -> Optional[str]:
    """Detects whether an option contract is a CALL or a PUT."""
    sym = (symbol or "").strip().upper()
    cat = (asset_category or "").strip().upper()
    if cat not in ("OPT", "FOP") and not (" C" in sym or " P" in sym or "CALL" in sym or "PUT" in sym):
        return None

    # Standard format: e.g. "ABAT 17OCT25 7 C", "QQQ 01OCT26 743 C"
    if sym.endswith(" C") or " C " in sym or sym.endswith(" CALL") or " CALL " in sym:
        return "CALL"
    if sym.endswith(" P") or " P " in sym or sym.endswith(" PUT") or " PUT " in sym:
        return "PUT"

    # OSI format: e.g. "AAPL  240119C00150000" or "SPY241220P00500000"
    import re

    osi_match = re.search(r"\d{6}([CP])\d{8}", sym)
    if osi_match:
        return "CALL" if osi_match.group(1) == "C" else "PUT"

    return None


def get_trade_direction(asset_category: str, symbol: str, is_buy: bool) -> str:
    """
    Determines trade direction based on asset class and initial side:
    - Equities / Derivatives: LONG / SHORT
    - Options: BUY CALL / SELL CALL / BUY PUT / SELL PUT
    - Forex / Cash currency conversions: EXCHANGE
    """
    cat = (asset_category or "").strip().upper()
    sym = (symbol or "").strip().upper()

    # Cash / Forex currency exchange operations
    if cat in ("CASH", "FX") or (
        "." in sym and len(sym.split(".")) == 2 and len(sym.split(".")[0]) == 3 and len(sym.split(".")[1]) == 3
    ):
        return "EXCHANGE"

    # Options contracts
    opt_type = detect_option_type(sym, cat)
    if opt_type:
        return f"BUY {opt_type}" if is_buy else f"SELL {opt_type}"

    # Default equities / standard positions
    return "LONG" if is_buy else "SHORT"


def group_executions_to_trades(executions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Reconstructs round-trip trades / positions from a list of individual execution fills.
    Matches opens and closes chronologically per symbol.
    """
    if not executions:
        return []

    from collections import defaultdict

    # Sort executions chronologically
    sorted_execs = sorted(executions, key=lambda x: (x.get("trade_time") or "00:00:00", x.get("id") or 0))

    trades_by_symbol = defaultdict(list)
    for fill in sorted_execs:
        trades_by_symbol[fill.get("symbol", "")].append(fill)

    all_grouped: List[Dict[str, Any]] = []

    for symbol, fills in trades_by_symbol.items():
        pos = 0.0
        current_trade: Optional[Dict[str, Any]] = None
        trade_idx = 1

        for fill in fills:
            qty = float(fill.get("quantity") or 0.0)
            bs = (fill.get("buy_sell") or "").upper()
            price = float(fill.get("trade_price") or 0.0)
            comm = float(fill.get("ib_commission") or 0.0)
            pnl = float(fill.get("realized_pnl") or 0.0)
            time_str = fill.get("trade_time") or "--:--"
            date_str = fill.get("trade_date") or ""
            raw_curr = fill.get("raw_currency") or fill.get("currency") or "EUR"
            base_curr = fill.get("base_currency") or "EUR"
            fx_rate = float(fill.get("fx_rate_to_base") or 1.0)
            raw_comm_val = fill.get("raw_commission")
            raw_comm = float(raw_comm_val) if raw_comm_val is not None else comm
            raw_pnl_val = fill.get("raw_realized_pnl")
            raw_pnl = float(raw_pnl_val) if raw_pnl_val is not None else pnl
            fill_cat = fill.get("asset_category", "STK")

            if current_trade is None:
                is_initial_buy = qty > 0 or bs == "BUY"
                direction = get_trade_direction(fill_cat, symbol, is_initial_buy)
                current_trade = {
                    "trade_id": f"tr_{date_str}_{symbol}_{trade_idx}",
                    "symbol": symbol,
                    "description": fill.get("description", ""),
                    "asset_category": fill_cat,
                    "direction": direction,
                    "is_initial_buy": is_initial_buy,
                    "currency": fill.get("currency", "EUR"),
                    "raw_currency": raw_curr,
                    "base_currency": base_curr,
                    "fx_rate_to_base": fx_rate,
                    "open_time": time_str,
                    "close_time": None,
                    "duration": None,
                    "entry_qty": 0.0,
                    "entry_val": 0.0,
                    "exit_qty": 0.0,
                    "exit_val": 0.0,
                    "gross_pnl": 0.0,
                    "commission": 0.0,
                    "raw_gross_pnl": 0.0,
                    "raw_commission": 0.0,
                    "fills": [],
                }
                trade_idx += 1

            is_entry = (current_trade["is_initial_buy"] and qty > 0) or (
                not current_trade["is_initial_buy"] and qty < 0
            )
            fill_abs_qty = abs(qty)

            current_trade["fills"].append(fill)
            current_trade["commission"] += comm
            current_trade["gross_pnl"] += pnl
            current_trade["raw_commission"] += raw_comm
            current_trade["raw_gross_pnl"] += raw_pnl

            if is_entry:
                current_trade["entry_qty"] += fill_abs_qty
                current_trade["entry_val"] += fill_abs_qty * price
            else:
                current_trade["exit_qty"] += fill_abs_qty
                current_trade["exit_val"] += fill_abs_qty * price
                current_trade["close_time"] = time_str

            pos += qty

            if abs(pos) < 1e-6:
                # Closed round-trip
                current_trade["status"] = "CLOSED"
                current_trade["duration"] = format_trade_duration(
                    current_trade["open_time"], current_trade["close_time"]
                )
                multiplier = 100.0 if current_trade["asset_category"] == "OPT" else 1.0
                if abs(current_trade["gross_pnl"]) < 1e-6 and (current_trade["entry_val"] > 0 or current_trade["exit_val"] > 0):
                    if current_trade["is_initial_buy"]:
                        raw_calc_pnl = (current_trade["exit_val"] - current_trade["entry_val"]) * multiplier
                    else:
                        raw_calc_pnl = (current_trade["entry_val"] - current_trade["exit_val"]) * multiplier
                    current_trade["raw_gross_pnl"] = round(raw_calc_pnl, 2)
                    current_trade["gross_pnl"] = round(raw_calc_pnl * current_trade["fx_rate_to_base"], 2)

                current_trade["net_pnl"] = round(current_trade["gross_pnl"] - current_trade["commission"], 2)
                current_trade["gross_pnl"] = round(current_trade["gross_pnl"], 2)
                current_trade["commission"] = round(current_trade["commission"], 2)
                current_trade["raw_gross_pnl"] = round(current_trade["raw_gross_pnl"], 2)
                current_trade["raw_commission"] = round(current_trade["raw_commission"], 2)
                current_trade["raw_net_pnl"] = round(
                    current_trade["raw_gross_pnl"] - current_trade["raw_commission"], 2
                )
                current_trade["avg_entry_price"] = (
                    round(current_trade["entry_val"] / current_trade["entry_qty"], 4)
                    if current_trade["entry_qty"] > 0
                    else 0.0
                )
                current_trade["avg_exit_price"] = (
                    round(current_trade["exit_val"] / current_trade["exit_qty"], 4)
                    if current_trade["exit_qty"] > 0
                    else 0.0
                )
                current_trade["quantity"] = max(current_trade["entry_qty"], current_trade["exit_qty"])

                if current_trade["net_pnl"] > 0.005:
                    current_trade["result"] = "WIN"
                elif current_trade["net_pnl"] < -0.005:
                    current_trade["result"] = "LOSS"
                else:
                    current_trade["result"] = "BREAKEVEN"

                all_grouped.append(current_trade)
                current_trade = None
                pos = 0.0

        if current_trade is not None:
            # Partially open position
            current_trade["status"] = "OPEN"
            current_trade["duration"] = (
                format_trade_duration(current_trade["open_time"], current_trade["close_time"])
                if current_trade["close_time"]
                else None
            )
            current_trade["net_pnl"] = round(current_trade["gross_pnl"] - current_trade["commission"], 2)
            current_trade["gross_pnl"] = round(current_trade["gross_pnl"], 2)
            current_trade["commission"] = round(current_trade["commission"], 2)
            current_trade["raw_gross_pnl"] = round(current_trade["raw_gross_pnl"], 2)
            current_trade["raw_commission"] = round(current_trade["raw_commission"], 2)
            current_trade["raw_net_pnl"] = round(current_trade["raw_gross_pnl"] - current_trade["raw_commission"], 2)
            current_trade["avg_entry_price"] = (
                round(current_trade["entry_val"] / current_trade["entry_qty"], 4)
                if current_trade["entry_qty"] > 0
                else 0.0
            )
            current_trade["avg_exit_price"] = (
                round(current_trade["exit_val"] / current_trade["exit_qty"], 4)
                if current_trade["exit_qty"] > 0
                else 0.0
            )
            current_trade["quantity"] = max(current_trade["entry_qty"], current_trade["exit_qty"])
            current_trade["result"] = "OPEN"
            all_grouped.append(current_trade)

    # Sort child fills inside each grouped trade descending (most recent first)
    for trade in all_grouped:
        if "fills" in trade and isinstance(trade["fills"], list):
            trade["fills"].sort(key=lambda x: (x.get("trade_time") or "00:00:00", x.get("id") or 0), reverse=True)

    # Sort all grouped trades chronologically descending by open_time (most recent first)
    all_grouped.sort(key=lambda x: (x.get("open_time") or "00:00:00", x.get("symbol") or ""), reverse=True)
    return all_grouped


def get_day_trades(target_date_str: str) -> List[Dict[str, Any]]:
    """Returns detailed individual executions for a given day sorted descending (most recent first)."""
    query = """
    SELECT
        id, ib_exec_id, trade_id, symbol, description, asset_category,
        currency, raw_currency, base_currency, fx_rate_to_base,
        raw_commission, raw_realized_pnl,
        buy_sell, quantity, trade_price, trade_money, proceeds,
        ib_commission, realized_pnl, (realized_pnl - ib_commission) as net_pnl,
        trade_date, trade_time, open_close_indicator
    FROM trades
    WHERE trade_date = ?
    ORDER BY trade_time DESC, id DESC
    """
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (target_date_str,))
        return [dict(row) for row in cursor.fetchall()]
