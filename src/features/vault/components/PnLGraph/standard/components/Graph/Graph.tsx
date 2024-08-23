import { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePnLChartData } from '../../hooks';
import { PnLTooltip } from '../PnLTooltip';
import type { Theme } from '@material-ui/core';
import { makeStyles, useMediaQuery } from '@material-ui/core';
import { GraphLoader } from '../../../../GraphLoader';
import {
  GRAPH_TIME_BUCKETS,
  makeUnderlyingTickFormatter,
  makeUsdTickFormatter,
} from '../../../../../../../helpers/graph/graph';
import { Legend } from '../Legend';
import { styles } from './styles';
import { XAxisTick } from '../../../../../../../components/XAxisTick';
import { GraphNoData } from '../../../../../../../components/GraphNoData/GraphNoData';
import { useXAxis, useYAxis } from '../../../../../../../helpers/graph/hooks';

const useStyles = makeStyles(styles);

interface GraphProps {
  vaultId: string;
  period: number;
  address?: string;
}

export const Graph = memo<GraphProps>(function Graph({ vaultId, period, address }) {
  const classes = useStyles();
  const xsDown = useMediaQuery((theme: Theme) => theme.breakpoints.down('xs'), { noSsr: true });
  const chartMargin = useMemo(() => {
    const xMargin = xsDown ? 16 : 24;
    return { top: 14, right: xMargin, bottom: 0, left: xMargin };
  }, [xsDown]);
  const { chartData, isLoading, willRetry } = usePnLChartData(
    GRAPH_TIME_BUCKETS[period],
    vaultId,
    address
  );
  const { data, minUnderlying, maxUnderlying, minUsd, maxUsd } = chartData;

  const usdAxis = useYAxis(minUsd, maxUsd, makeUsdTickFormatter);
  const underlyingAxis = useYAxis(minUnderlying, maxUnderlying, makeUnderlyingTickFormatter);
  const dateAxis = useXAxis(GRAPH_TIME_BUCKETS[period], data.length, xsDown);

  if (isLoading) {
    return <GraphLoader imgHeight={220} />;
  }

  if (!data.length) {
    return <GraphNoData reason={willRetry ? 'error-retry' : 'error'} />;
  }

  return (
    <div className={classes.graphContainer}>
      <Legend vaultId={vaultId} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          width={450}
          height={200}
          data={data}
          margin={chartMargin}
          className={classes.graph}
        >
          <CartesianGrid strokeDasharray="2 2" stroke="#363B63" />
          <XAxis
            tickFormatter={dateAxis.formatter}
            dataKey="datetime"
            padding="no-gap"
            tickMargin={10}
            stroke="#363B63"
            interval={dateAxis.interval}
            tick={XAxisTick}
          />
          <Line
            yAxisId="underlying"
            strokeWidth={1.5}
            dataKey="underlyingBalance"
            stroke="#4DB258"
            dot={false}
            type="linear"
          />
          <Line
            yAxisId="usd"
            strokeWidth={1.5}
            dataKey="usdBalance"
            stroke="#5C70D6"
            dot={false}
            type="linear"
          />
          <YAxis
            stroke="#4DB258"
            strokeWidth={1.5}
            tickFormatter={underlyingAxis.formatter}
            yAxisId="underlying"
            domain={underlyingAxis.domain}
            ticks={underlyingAxis.ticks}
            mirror={true}
          />
          <YAxis
            stroke="#5C70D6"
            orientation="right"
            strokeWidth={1.5}
            tickFormatter={usdAxis.formatter}
            yAxisId="usd"
            domain={usdAxis.domain}
            ticks={usdAxis.ticks}
            mirror={true}
          />
          <Tooltip wrapperStyle={{ outline: 'none' }} content={<PnLTooltip />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
