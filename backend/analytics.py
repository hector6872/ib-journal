import calendar
from datetime import date, datetime, timedelta
from typing import Dict, Any, List, Optional
from backend.database import db_session

def get_overview_stats(start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes global trading performance KPIs:
    - Win Rate %
    - Operations (Total Trades)
    - Profit Factor (PF)
    - Expectancy
    - Total Net Realized P&L
    - Total Commissions
    """
    query = """
    SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(realized_pnl), 0.0) as gross_pnl,
        COALESCE(SUM(ib_commission), 0.0) as total_commissions,
        COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as winning_trades,
        COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losing_trades,
        COALESCE(SUM(CASE WHEN realized_pnl = 0 THEN 1 ELSE 0 END), 0) as breakeven_trades,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE 0 END), 0.0) as gross_profit,
        COALESCE(ABS(SUM(CASE WHEN realized_pnl < 0 THEN realized_pnl ELSE 0 END)), 0.0) as gross_loss,
        COALESCE(MAX(realized_pnl), 0.0) as largest_win,
        COALESCE(MIN(realized_pnl), 0.0) as largest_loss
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
        gross_profit = row["gross_profit"]
        gross_loss = row["gross_loss"]
        net_pnl = row["net_pnl"]
        gross_pnl = row["gross_pnl"]
        commissions = row["total_commissions"]

        # Calculations
        win_rate = round((winning_trades / total_trades * 100), 1) if total_trades > 0 else 0.0
        profit_factor = round((gross_profit / gross_loss), 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0)
        
        avg_win = (gross_profit / winning_trades) if winning_trades > 0 else 0.0
        avg_loss = (gross_loss / losing_trades) if losing_trades > 0 else 0.0
        loss_rate = (losing_trades / total_trades) if total_trades > 0 else 0.0
        win_rate_dec = (winning_trades / total_trades) if total_trades > 0 else 0.0
        
        expectancy = round((win_rate_dec * avg_win) - (loss_rate * avg_loss), 2)

        return {
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "breakeven_trades": row["breakeven_trades"],
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "expectancy": expectancy,
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "total_commissions": round(commissions, 2),
            "gross_pnl": round(gross_pnl, 2),
            "net_pnl": round(net_pnl, 2),
            "largest_win": round(row["largest_win"], 2),
            "largest_loss": round(row["largest_loss"], 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2)
        }

def get_detailed_stats() -> Dict[str, Any]:
    """
    Returns comprehensive trading statistics:
    - Overview KPIs
    - Symbol breakdown
    - Asset class breakdown
    - Long vs Short breakdown
    - Day of week performance
    """
    overview = get_overview_stats()
    
    with db_session() as conn:
        cursor = conn.cursor()
        
        # 1. Symbol Breakdown
        cursor.execute("""
            SELECT 
                symbol,
                asset_category,
                COUNT(*) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
                COALESCE(SUM(ib_commission), 0.0) as commissions,
                COALESCE(SUM(ABS(quantity)), 0.0) as total_volume
            FROM trades
            GROUP BY symbol, asset_category
            ORDER BY net_pnl DESC
        """)
        symbols = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            symbols.append({
                "symbol": r["symbol"],
                "category": r["asset_category"] or "STK",
                "trades_count": cnt,
                "wins": wins,
                "losses": r["losses"],
                "win_rate": wr,
                "net_pnl": round(r["net_pnl"], 2),
                "commissions": round(r["commissions"], 2),
                "total_volume": round(r["total_volume"], 0)
            })

        # 2. Asset Category Breakdown
        cursor.execute("""
            SELECT 
                COALESCE(asset_category, 'STK') as category,
                COUNT(*) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl
            FROM trades
            GROUP BY asset_category
            ORDER BY net_pnl DESC
        """)
        categories = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            categories.append({
                "category": r["category"],
                "trades_count": cnt,
                "win_rate": wr,
                "net_pnl": round(r["net_pnl"], 2)
            })

        # 3. Buy vs Sell / Long vs Short
        cursor.execute("""
            SELECT 
                buy_sell,
                COUNT(*) as trades_count,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl
            FROM trades
            GROUP BY buy_sell
        """)
        sides = []
        for r in cursor.fetchall():
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            sides.append({
                "side": r["buy_sell"],
                "trades_count": cnt,
                "win_rate": wr,
                "net_pnl": round(r["net_pnl"], 2)
            })

        # 4. Day of Week Breakdown
        cursor.execute("""
            SELECT 
                strftime('%w', trade_date) as day_of_week,
                COUNT(*) as trades_count,
                COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
                COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins
            FROM trades
            GROUP BY strftime('%w', trade_date)
            ORDER BY day_of_week ASC
        """)
        dow_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        dow_list = []
        for r in cursor.fetchall():
            dow_idx = int(r["day_of_week"])
            cnt = r["trades_count"]
            wins = r["wins"]
            wr = round((wins / cnt * 100), 1) if cnt > 0 else 0.0
            dow_list.append({
                "day_index": dow_idx,
                "day_name": dow_names[dow_idx],
                "trades_count": cnt,
                "win_rate": wr,
                "net_pnl": round(r["net_pnl"], 2)
            })

    return {
        "overview": overview,
        "symbols": symbols,
        "categories": categories,
        "sides": sides,
        "day_of_week": dow_list
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
        COUNT(*) as trades_count,
        COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losses
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
                "losses": row["losses"]
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
        
        monthly_totals.append({
            "month": m,
            "net_pnl": round(m_pnl, 2),
            "trades_count": m_count
        })
        year_net_pnl += m_pnl
        year_trades_count += m_count

    return {
        "year": year,
        "daily": daily_map,
        "monthly": monthly_totals,
        "total_net_pnl": round(year_net_pnl, 2),
        "total_trades": year_trades_count
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
        COUNT(*) as trades_count,
        COALESCE(SUM(realized_pnl - ib_commission), 0.0) as net_pnl,
        COALESCE(SUM(ib_commission), 0.0) as commissions,
        COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losses
    FROM trades
    WHERE trade_date BETWEEN ? AND ?
    GROUP BY trade_date
    """

    daily_map = {}
    month_net_pnl = 0.0
    month_trades_count = 0
    month_wins = 0
    month_losses = 0

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
                "losses": row["losses"]
            }
            month_net_pnl += pnl
            month_trades_count += row["trades_count"]
            month_wins += row["wins"]
            month_losses += row["losses"]

    # Fill empty days for complete calendar mapping
    days_list = []
    for day in range(1, last_day + 1):
        d_str = f"{year}-{m_str}-{day:02d}"
        if d_str in daily_map:
            days_list.append(daily_map[d_str])
        else:
            days_list.append({
                "date": d_str,
                "pnl": 0.0,
                "commissions": 0.0,
                "count": 0,
                "wins": 0,
                "losses": 0
            })

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
        "win_rate": win_rate
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
        trade_date, trade_time
    FROM trades
    WHERE trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC, trade_time ASC
    """

    trades_by_date: Dict[str, List[Dict[str, Any]]] = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (monday.isoformat(), sunday.isoformat()))
        for row in cursor.fetchall():
            d = row["trade_date"]
            if d not in trades_by_date:
                trades_by_date[d] = []
            trades_by_date[d].append(dict(row))

    days = []
    week_net_pnl = 0.0
    week_trades_count = 0

    # 5 Trading Days: Monday (0) to Friday (4)
    for i in range(5):
        current_d = monday + timedelta(days=i)
        d_str = current_d.isoformat()
        day_trades = trades_by_date.get(d_str, [])

        day_pnl = sum(t["net_pnl"] for t in day_trades)
        day_wins = sum(1 for t in day_trades if t["realized_pnl"] > 0)
        day_losses = sum(1 for t in day_trades if t["realized_pnl"] < 0)

        days.append({
            "date": d_str,
            "day_number": current_d.day,
            "weekday_index": i, # 0 = Monday, 4 = Friday
            "pnl": round(day_pnl, 2),
            "trades_count": len(day_trades),
            "wins": day_wins,
            "losses": day_losses,
            "trades": day_trades
        })
        week_net_pnl += day_pnl
        week_trades_count += len(day_trades)

    return {
        "start_date": monday.isoformat(),
        "end_date": friday.isoformat(),
        "days": days,
        "total_net_pnl": round(week_net_pnl, 2),
        "total_trades": week_trades_count
    }

def get_day_trades(target_date_str: str) -> List[Dict[str, Any]]:
    """Returns detailed individual executions for a given day."""
    query = """
    SELECT 
        id, ib_exec_id, trade_id, symbol, description, asset_category,
        currency, buy_sell, quantity, trade_price, trade_money, proceeds,
        ib_commission, realized_pnl, (realized_pnl - ib_commission) as net_pnl,
        trade_date, trade_time, open_close_indicator
    FROM trades
    WHERE trade_date = ?
    ORDER BY trade_time ASC, id ASC
    """
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (target_date_str,))
        return [dict(row) for row in cursor.fetchall()]
