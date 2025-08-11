import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function PortfolioReport() {
  const [trades, setTrades] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [stocksMap, setStocksMap] = useState({});
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actualPrices, setActualPrices] = useState({});
  const [loading, setLoading] = useState(false);

  // Загружаем все акции для отображения ticker по stock_id
  useEffect(() => {
    async function fetchStocks() {
      const { data, error } = await supabase.from('stocks').select('stock_id, ticker');
      if (error) {
        console.error('Ошибка загрузки акций', error);
        return;
      }
      const map = {};
      data.forEach(s => {
        map[s.stock_id] = s.ticker;
      });
      setStocksMap(map);
    }
    fetchStocks();
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Формируем запрос для сделок с фильтрами
      let tradesQuery = supabase
        .from('trades')
        .select('*')
        .order('trade_date', { ascending: false });

      if (dateFrom) tradesQuery = tradesQuery.gte('trade_date', dateFrom);
      if (dateTo) tradesQuery = tradesQuery.lte('trade_date', dateTo);
      if (selectedTicker) {
        // На стороне БД фильтровать по тикеру нельзя — фильтруем в коде ниже
      }

      let dividendsQuery = supabase
        .from('dividends')
        .select('*')
        .order('payment_date', { ascending: false });

      if (dateFrom) dividendsQuery = dividendsQuery.gte('payment_date', dateFrom);
      if (dateTo) dividendsQuery = dividendsQuery.lte('payment_date', dateTo);

      const [{ data: tradesData, error: tradesError }, { data: divData, error: divError }] = await Promise.all([
        tradesQuery,
        dividendsQuery,
      ]);

      if (tradesError || divError) {
        console.error('Ошибка загрузки данных', tradesError || divError);
        setLoading(false);
        return;
      }

      // Присваиваем тикер каждой сделке через stocksMap
      const tradesWithTicker = (tradesData || []).map(t => ({
        ...t,
        ticker: stocksMap[t.stock_id] || '—',
      }));

      const dividendsWithTicker = (divData || []).map(d => ({
        ...d,
        ticker: stocksMap[d.stock_id] || '—',
      }));

      // Если выбран тикер, фильтруем здесь
      const filteredTrades = selectedTicker
        ? tradesWithTicker.filter(t => t.ticker === selectedTicker)
        : tradesWithTicker;

      const filteredDividends = selectedTicker
        ? dividendsWithTicker.filter(d => d.ticker === selectedTicker)
        : dividendsWithTicker;

      setTrades(filteredTrades);
      setDividends(filteredDividends);

      // Формируем уникальные тикеры из текущих данных
      const uniqueTickersSet = new Set([
        ...filteredTrades.map(t => t.ticker).filter(t => t !== '—'),
        ...filteredDividends.map(d => d.ticker).filter(t => t !== '—'),
      ]);
      setTickers([...uniqueTickersSet].sort());

      setLoading(false);
    }
    fetchData();
  }, [dateFrom, dateTo, selectedTicker, stocksMap]);

  // --- остальные функции (avgBuyPrice, portfolioValue, totalDividends, totalProfit, handleActualPriceChange)
  // — такие же, как я писал ранее, с заменой trades[].stocks?.ticker на trades[].ticker

  const avgBuyPrice = ticker => {
    const buys = trades.filter(t => t.trade_type === 'BUY' && t.ticker === ticker);
    const totalQty = buys.reduce((sum, t) => sum + t.quantity, 0);
    if (totalQty === 0) return 0;
    const totalCost = buys.reduce((sum, t) => sum + (t.price_per_share * t.quantity), 0);
    return totalCost / totalQty;
  };

  const portfolioValue = () => {
    const positions = {};
    trades.forEach(t => {
      if (!t.ticker) return;
      const tk = t.ticker;
      positions[tk] = (positions[tk] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    let total = 0;
    for (const [ticker, qty] of Object.entries(positions)) {
      if (qty <= 0) continue;
      const price = actualPrices[ticker] || avgBuyPrice(ticker);
      total += price * qty;
    }
    return total;
  };

  const totalDividends = () => {
    return dividends.reduce((sum, d) => {
      if (selectedTicker && d.ticker !== selectedTicker) return sum;
      return sum + (d.amount_per_share * d.quantity);
    }, 0);
  };

  const totalProfit = () => {
    let profit = 0;
    const avgPrices = {};
    tickers.forEach(ticker => avgPrices[ticker] = avgBuyPrice(ticker));
    const sales = trades.filter(t => t.trade_type === 'SELL');
    sales.forEach(sell => {
      const tk = sell.ticker;
      if (!tk) return;
      const avgPrice = avgPrices[tk] || 0;
      const sellAmount = sell.price_per_share * sell.quantity;
      const buyCost = avgPrice * sell.quantity;
      profit += sellAmount - buyCost;
    });
    return profit;
  };

  const handleActualPriceChange = (ticker, value) => {
    setActualPrices(prev => ({
      ...prev,
      [ticker]: Number(value)
    }));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Отчет по портфелю</h2>

      <div style={{ marginBottom: 10 }}>
        <label>
          С даты:
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ marginLeft: 5, marginRight: 20 }}
          />
        </label>
        <label>
          По дату:
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ marginLeft: 5 }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>
          Тикер:
          <select
            value={selectedTicker}
            onChange={e => setSelectedTicker(e.target.value)}
            style={{ marginLeft: 5 }}
          >
            <option value="">Все</option>
            {tickers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p>Загрузка данных...</p>}

      {!loading && tickers.length === 0 && <p>Нет данных для отображения</p>}

      {!loading && tickers.length > 0 && (
        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>Тикер</th>
              <th>Средняя цена покупки</th>
              <th>Актуальная цена</th>
              <th>Количество на руках</th>
              <th>Стоимость портфеля</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map(ticker => {
              const buys = trades.filter(t => t.trade_type === 'BUY' && t.ticker === ticker);
              const totalQtyBought = buys.reduce((sum, t) => sum + t.quantity, 0);
              const sells = trades.filter(t => t.trade_type === 'SELL' && t.ticker === ticker);
              const totalQtySold = sells.reduce((sum, t) => sum + t.quantity, 0);
              const qtyOnHand = totalQtyBought - totalQtySold;
              if (qtyOnHand <= 0) return null;

              const avgPrice = avgBuyPrice(ticker);
              const actualPrice = actualPrices[ticker] || avgPrice;
              const value = qtyOnHand * actualPrice;

              return (
                <tr key={ticker}>
                  <td>{ticker}</td>
                  <td>{avgPrice.toFixed(2)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={actualPrices[ticker] ?? ''}
                      onChange={e => handleActualPriceChange(ticker, e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>{qtyOnHand}</td>
                  <td>{value.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 20 }}>
        <strong>Общая стоимость портфеля: </strong>{portfolioValue().toFixed(2)}<br />
        <strong>Сумма дивидендов: </strong>{totalDividends().toFixed(2)}<br />
        <strong>Прибыль/Убыток с продаж: </strong>{totalProfit().toFixed(2)}
      </div>
    </div>
  );
}
