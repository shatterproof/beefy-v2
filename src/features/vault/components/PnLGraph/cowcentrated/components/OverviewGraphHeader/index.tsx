import { Fragment, memo } from 'react';
import type { VaultEntity } from '../../../../../../data/entities/vault';
import { makeStyles } from '@material-ui/core';
import { Stat } from '../Stat';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../../../../../store';
import { selectClmPnl } from '../../../../../../data/selectors/analytics';
import {
  formatLargeUsd,
  formatPositiveOrNegative,
  formatTokenDisplayCondensed,
} from '../../../../../../../helpers/format';
import { BIG_ZERO } from '../../../../../../../helpers/big-number';
import { Tooltip } from '../../../../../../../components/Tooltip';
import { HelpOutline } from '@material-ui/icons';
import { styles } from './styles';

interface OverviewGraphHeaderProps {
  vaultId: VaultEntity['id'];
}

const useStyles = makeStyles(styles);

export const OverviewGraphHeader = memo<OverviewGraphHeaderProps>(function OverviewGraphHeader({
  vaultId,
}) {
  const classes = useStyles();

  const { t } = useTranslation();

  const { underlying, tokens, pnl, hold, yields } = useAppSelector(state =>
    selectClmPnl(state, vaultId)
  );

  return (
    <div className={classes.statsContainer}>
      <Stat
        tooltipText={t('pnl-graph-tooltip-deposit')}
        label={t('At Deposit')}
        value0={`${formatTokenDisplayCondensed(
          tokens[0].entry.amount,
          tokens[0].token.decimals,
          6
        )} ${tokens[0].token.symbol}`}
        value1={`${formatTokenDisplayCondensed(
          tokens[1].entry.amount,
          tokens[1].token.decimals,
          6
        )} ${tokens[1].token.symbol}`}
        value2={formatTokenDisplayCondensed(underlying.entry.amount, 18, 6)}
        subValue0={formatLargeUsd(tokens[0].entry.usd)}
        subValue1={formatLargeUsd(tokens[1].entry.usd)}
        subValue2={formatLargeUsd(underlying.entry.usd)}
      />
      <Stat
        tooltipText={t('pnl-graph-tooltip-now-clm')}
        label={t('Now')}
        value0={`${formatTokenDisplayCondensed(
          tokens[0].now.amount,
          tokens[0].token.decimals,
          6
        )} ${tokens[0].token.symbol}`}
        value1={`${formatTokenDisplayCondensed(
          tokens[1].now.amount,
          tokens[1].token.decimals,
          6
        )} ${tokens[1].token.symbol}`}
        value2={formatTokenDisplayCondensed(underlying.now.amount, 18, 6)}
        subValue0={formatLargeUsd(tokens[0].now.usd)}
        subValue1={formatLargeUsd(tokens[1].now.usd)}
        subValue2={formatLargeUsd(underlying.now.usd)}
      />
      <Stat
        tooltipText={t('pnl-graph-tooltip-change-clm')}
        label={t('Change')}
        value0={formatPositiveOrNegative(
          tokens[0].diff.amount,
          formatTokenDisplayCondensed(tokens[0].diff.amount, tokens[0].token.decimals, 6),
          tokens[0].token.symbol
        )}
        value1={formatPositiveOrNegative(
          tokens[1].diff.amount,
          formatTokenDisplayCondensed(tokens[1].diff.amount, tokens[1].token.decimals, 6),
          tokens[1].token.symbol
        )}
        value2={
          <Tooltip
            children={
              <div className={classes.tooltip}>
                <span
                  className={pnl.withClaimedPending.usd.gt(BIG_ZERO) ? classes.green : classes.red}
                >
                  {formatLargeUsd(pnl.withClaimedPending.usd, { positivePrefix: '+$' })}
                  {' PNL'}
                </span>
                <HelpOutline />
              </div>
            }
            content={
              <div>
                <div className={classes.itemContainer}>
                  <div className={classes.label}>{t('Base PNL')}</div>
                  <div className={classes.value}>{formatLargeUsd(pnl.base.usd)}</div>
                </div>
                {yields.claimed.sources.length ? (
                  <>
                    <div className={classes.itemContainer}>
                      <div className={classes.label}>{t('Claimed')}</div>
                      <div className={classes.value}>{formatLargeUsd(yields.claimed.usd)}</div>
                    </div>
                    <div className={classes.valueBreakdown}>
                      {yields.claimed.sources.map(source => (
                        <Fragment key={`${source.source}-${source.token.symbol}`}>
                          <div className={classes.label}>
                            {source.source} {source.token.symbol}
                          </div>
                          <div className={classes.value}>{formatLargeUsd(source.usd)}</div>
                        </Fragment>
                      ))}
                    </div>
                  </>
                ) : null}
                {yields.pending.sources.length ? (
                  <>
                    <div className={classes.itemContainer}>
                      <div className={classes.label}>{t('Pending')}</div>
                      <div className={classes.value}>{formatLargeUsd(yields.pending.usd)}</div>
                    </div>

                    <div className={classes.valueBreakdown}>
                      {yields.pending.sources.map(source => (
                        <Fragment key={`${source.source}-${source.token.symbol}`}>
                          <div className={classes.label}>
                            {source.source} {source.token.symbol}
                          </div>
                          <div className={classes.value}>{formatLargeUsd(source.usd)}</div>
                        </Fragment>
                      ))}
                    </div>
                  </>
                ) : null}
                <div className={classes.itemContainer}>
                  <div className={classes.label}>{t('Total PNL')}</div>
                  <div className={classes.value}>{formatLargeUsd(pnl.withClaimedPending.usd)}</div>
                </div>
              </div>
            }
            contentClass={classes.tooltipContent}
            arrowClass={classes.arrow}
          />
        }
        subValue2={
          <Tooltip
            children={
              <div className={classes.tooltip}>
                {`${formatLargeUsd(hold.usd)} HOLD`} <HelpOutline />
              </div>
            }
            content={
              <div>
                <div className={classes.itemContainer}>
                  <div className={classes.label}>{t('CLM VS HOLD')}</div>
                  <div className={classes.value}>
                    {formatLargeUsd(hold.diff.withClaimedPending, { positivePrefix: '+$' })}
                  </div>
                </div>
              </div>
            }
            contentClass={classes.tooltipContent}
            arrowClass={classes.arrow}
          />
        }
      />
    </div>
  );
});
