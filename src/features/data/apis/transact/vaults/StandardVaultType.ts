import type { VaultStandard } from '../../../entities/vault';
import { isStandardVault } from '../../../entities/vault';
import type { BeefyState, BeefyStateFn } from '../../../../../redux-types';
import { selectTokenByAddress } from '../../../selectors/tokens';
import type {
  IStandardVaultType,
  VaultDepositRequest,
  VaultDepositResponse,
  VaultWithdrawRequest,
  VaultWithdrawResponse,
} from './IVaultType';
import {
  isTokenEqual,
  isTokenErc20,
  isTokenNative,
  type TokenEntity,
  type TokenErc20,
  type TokenNative,
} from '../../../entities/token';
import {
  createOptionId,
  createQuoteId,
  createSelectionId,
  onlyInputCount,
  onlyOneInput,
} from '../helpers/options';
import type {
  InputTokenAmount,
  StandardVaultDepositOption,
  StandardVaultDepositQuote,
  StandardVaultWithdrawOption,
  StandardVaultWithdrawQuote,
  TokenAmount,
  TransactQuote,
} from '../transact-types';
import { TransactMode } from '../../../reducers/wallet/transact-types';
import { first } from 'lodash-es';
import { BIG_ZERO, fromWei, toWei, toWeiString } from '../../../../../helpers/big-number';
import { selectFeesByVaultId } from '../../../selectors/fees';
import { selectChainById } from '../../../selectors/chains';
import { getWeb3Instance } from '../../instances';
import { StandardVaultAbi } from '../../../../../config/abi/StandardVaultAbi';
import { BigNumber } from 'bignumber.js';
import abiCoder from 'web3-eth-abi';
import { getInsertIndex, getTokenAddress } from '../helpers/zap';
import { walletActions } from '../../../actions/wallet-actions';
import type { Namespace, TFunction } from 'react-i18next';
import type { Step } from '../../../reducers/wallet/stepper';
import { MultiCall } from 'eth-multicall';
import { getVaultWithdrawnFromContract, getVaultWithdrawnFromState } from '../helpers/vault';
import { selectWalletAddressOrThrow } from '../../../selectors/wallet';
import type { ZapStep } from '../zap/types';
import type { AbiItem } from 'web3-utils';

export class StandardVaultType implements IStandardVaultType {
  public readonly id = 'standard';
  public readonly vault: VaultStandard;
  public readonly depositToken: TokenEntity;
  public readonly shareToken: TokenErc20;
  protected readonly getState: BeefyStateFn;

  constructor(vault: VaultStandard, getState: BeefyStateFn) {
    if (!isStandardVault(vault)) {
      throw new Error('Vault is not a standard vault');
    }

    const state = getState();
    this.getState = getState;
    this.vault = vault;
    this.depositToken = selectTokenByAddress(state, vault.chainId, vault.depositTokenAddress);

    const shareToken = selectTokenByAddress(state, vault.chainId, vault.contractAddress);
    if (!isTokenErc20(shareToken)) {
      throw new Error('Share token is not an ERC20 token');
    }
    this.shareToken = shareToken;
  }

  protected calculateDepositFee(input: TokenAmount, state: BeefyState): BigNumber {
    const fees = selectFeesByVaultId(state, this.vault.id);
    const depositFeePercent = fees?.deposit || 0;
    return depositFeePercent > 0
      ? input.amount
          .multipliedBy(depositFeePercent)
          .decimalPlaces(input.token.decimals, BigNumber.ROUND_FLOOR)
      : BIG_ZERO;
  }

  async fetchZapDeposit(request: VaultDepositRequest): Promise<VaultDepositResponse> {
    onlyInputCount(request.inputs, 1);

    const input = first(request.inputs)!; // we checked length above
    if (!isTokenEqual(input.token, this.depositToken)) {
      throw new Error('Input token is not the deposit token');
    }

    const state = this.getState();
    const chain = selectChainById(state, this.vault.chainId);
    const web3 = await getWeb3Instance(chain);
    const vaultContract = new web3.eth.Contract(
      StandardVaultAbi as unknown as AbiItem[],
      this.vault.contractAddress
    );
    const ppfsRaw = await vaultContract.methods.getPricePerFullShare().call();
    const ppfs = new BigNumber(ppfsRaw);
    const depositFee = this.calculateDepositFee(input, state);
    const inputWeiAfterFee = toWei(input.amount.minus(depositFee), input.token.decimals);
    const expectedShares = inputWeiAfterFee
      .shiftedBy(this.shareToken.decimals)
      .dividedToIntegerBy(ppfs);

    const outputs = [
      {
        token: this.shareToken,
        amount: fromWei(expectedShares, this.shareToken.decimals),
      },
    ];

    return {
      inputs: request.inputs,
      outputs,
      minOutputs: outputs,
      zap: isTokenNative(input.token)
        ? this.fetchNativeZapDeposit(this.vault.contractAddress, input.token, input.amount)
        : this.fetchErc20ZapDeposit(
            this.vault.contractAddress,
            input.token,
            input.amount,
            input.max
          ),
    };
  }

  protected fetchErc20ZapDeposit(
    vaultAddress: string,
    depositToken: TokenErc20,
    depositAmount: BigNumber,
    depositAll: boolean
  ): ZapStep {
    if (depositAll) {
      return {
        target: vaultAddress,
        value: '0',
        data: abiCoder.encodeFunctionCall(
          {
            constant: false,
            inputs: [],
            name: 'depositAll',
            outputs: [],
            payable: false,
            stateMutability: 'nonpayable',
            type: 'function',
          },
          []
        ),
        tokens: [
          {
            token: getTokenAddress(depositToken),
            index: -1,
          },
        ],
      };
    }

    return {
      target: vaultAddress,
      value: '0',
      data: abiCoder.encodeFunctionCall(
        {
          constant: false,
          inputs: [
            {
              internalType: 'uint256',
              name: '_amount',
              type: 'uint256',
            },
          ],
          name: 'deposit',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [toWeiString(depositAmount, depositToken.decimals)]
      ),
      tokens: [
        {
          token: getTokenAddress(depositToken),
          index: getInsertIndex(0),
        },
      ],
    };
  }

  protected fetchNativeZapDeposit(
    vaultAddress: string,
    depositToken: TokenNative,
    depositAmount: BigNumber
  ): ZapStep {
    return {
      target: vaultAddress,
      value: toWeiString(depositAmount, depositToken.decimals),
      data: abiCoder.encodeFunctionCall(
        {
          constant: false,
          inputs: [],
          name: 'depositBNB',
          outputs: [],
          payable: true,
          stateMutability: 'payable',
          type: 'function',
        },
        []
      ),
      tokens: [
        {
          token: getTokenAddress(depositToken),
          index: -1,
        },
      ],
    };
  }

  async fetchDepositOption(): Promise<StandardVaultDepositOption> {
    const inputs = [this.depositToken];
    const selectionId = createSelectionId(this.vault.chainId, inputs);

    return {
      id: createOptionId('vault-standard', this.vault.id, selectionId),
      vaultId: this.vault.id,
      chainId: this.vault.chainId,
      selectionId,
      selectionOrder: 1,
      inputs,
      wantedOutputs: inputs,
      strategyId: 'vault',
      vaultType: 'standard',
      mode: TransactMode.Deposit,
    };
  }

  async fetchDepositQuote(
    inputs: InputTokenAmount[],
    option: StandardVaultDepositOption
  ): Promise<StandardVaultDepositQuote> {
    const input = onlyOneInput(inputs);
    if (input.amount.lte(BIG_ZERO)) {
      throw new Error('Quote called with 0 input amount');
    }

    if (!isTokenEqual(input.token, this.depositToken)) {
      throw new Error('Quote called with invalid input token');
    }

    const state = this.getState();
    const fee = this.calculateDepositFee(input, state);
    const output = {
      token: input.token,
      amount: input.amount.minus(fee),
    };
    const allowances = isTokenErc20(input.token)
      ? [
          {
            token: input.token,
            amount: input.amount,
            spenderAddress: this.vault.contractAddress,
          },
        ]
      : [];

    return {
      id: createQuoteId(option.id),
      strategyId: option.strategyId,
      vaultType: option.vaultType,
      option,
      inputs,
      outputs: [output],
      returned: [],
      allowances,
      priceImpact: 0,
    };
  }

  async fetchDepositStep(quote: TransactQuote, t: TFunction<Namespace>): Promise<Step> {
    onlyInputCount(quote.inputs, 1);

    const input = first(quote.inputs)!; // we checked length above

    return {
      step: 'deposit',
      message: t('Vault-TxnConfirm', { type: t('Deposit-noun') }),
      action: walletActions.deposit(this.vault, input.amount, input.max),
      pending: false,
      extraInfo: { zap: false, vaultId: quote.option.vaultId },
    };
  }

  async fetchWithdrawOption(): Promise<StandardVaultWithdrawOption> {
    const inputs = [this.depositToken];
    const selectionId = createSelectionId(this.vault.chainId, inputs);

    return {
      id: createOptionId('vault-standard', this.vault.id, selectionId),
      vaultId: this.vault.id,
      chainId: this.vault.chainId,
      selectionId,
      selectionOrder: 1,
      inputs,
      wantedOutputs: inputs,
      strategyId: 'vault',
      vaultType: 'standard',
      mode: TransactMode.Withdraw,
    };
  }

  async fetchWithdrawQuote(
    inputs: InputTokenAmount[],
    option: StandardVaultWithdrawOption
  ): Promise<StandardVaultWithdrawQuote> {
    const input = onlyOneInput(inputs);

    if (input.amount.lte(BIG_ZERO)) {
      throw new Error('Quote called with 0 input amount');
    }

    if (!isTokenEqual(input.token, this.depositToken)) {
      throw new Error('Quote called with invalid input token');
    }

    const state = this.getState();
    const { withdrawnAmountAfterFeeWei } = getVaultWithdrawnFromState(input, this.vault, state);
    const outputs = [
      {
        token: input.token,
        amount: fromWei(withdrawnAmountAfterFeeWei, input.token.decimals),
      },
    ];
    const allowances = [];

    return {
      id: createQuoteId(option.id),
      strategyId: option.strategyId,
      vaultType: option.vaultType,
      option,
      inputs,
      outputs,
      returned: [],
      allowances,
      priceImpact: 0,
    };
  }

  async fetchWithdrawStep(quote: TransactQuote, t: TFunction<Namespace>): Promise<Step> {
    onlyInputCount(quote.inputs, 1);

    const input = first(quote.inputs)!; // we checked length above

    return {
      step: 'withdraw',
      message: t('Vault-TxnConfirm', { type: t('Withdraw-noun') }),
      action: walletActions.withdraw(this.vault, input.amount, input.max),
      pending: false,
      extraInfo: { zap: false, vaultId: quote.option.vaultId },
    };
  }

  async fetchZapWithdraw(request: VaultWithdrawRequest): Promise<VaultWithdrawResponse> {
    const input = onlyOneInput(request.inputs);
    if (!isTokenEqual(input.token, this.depositToken)) {
      throw new Error('Input token is not the deposit token');
    }

    const state = this.getState();
    const chain = selectChainById(state, this.vault.chainId);
    const web3 = await getWeb3Instance(chain);
    const multicall = new MultiCall(web3, chain.multicallAddress);
    const address = selectWalletAddressOrThrow(state);
    const { sharesToWithdrawWei, withdrawnAmountAfterFeeWei } = await getVaultWithdrawnFromContract(
      input,
      this.vault,
      state,
      address,
      web3,
      multicall
    );

    const inputs = [
      {
        token: this.shareToken,
        amount: fromWei(sharesToWithdrawWei, this.shareToken.decimals),
        max: input.max,
      },
    ];
    const outputs = [
      {
        token: this.depositToken,
        amount: fromWei(withdrawnAmountAfterFeeWei, this.depositToken.decimals),
      },
    ];

    return {
      inputs,
      outputs,
      minOutputs: outputs,
      zap: isTokenNative(this.depositToken)
        ? this.fetchNativeZapWithdraw(
            this.vault.contractAddress,
            this.shareToken,
            sharesToWithdrawWei,
            input.max
          )
        : this.fetchErc20ZapWithdraw(
            this.vault.contractAddress,
            this.shareToken,
            sharesToWithdrawWei,
            input.max
          ),
    };
  }

  protected fetchNativeZapWithdraw(
    vaultAddress: string,
    shareToken: TokenErc20,
    sharesToWithdrawWei: BigNumber,
    withdrawAll: boolean
  ): ZapStep {
    if (withdrawAll) {
      return {
        target: vaultAddress,
        value: '0',
        data: abiCoder.encodeFunctionCall(
          {
            constant: false,
            inputs: [],
            name: 'withdrawAllBNB',
            outputs: [],
            payable: false,
            stateMutability: 'nonpayable',
            type: 'function',
          },
          []
        ),
        tokens: [
          {
            token: getTokenAddress(shareToken),
            index: -1,
          },
        ],
      };
    }

    return {
      target: vaultAddress,
      value: '0',
      data: abiCoder.encodeFunctionCall(
        {
          constant: false,
          inputs: [
            {
              internalType: 'uint256',
              name: '_shares',
              type: 'uint256',
            },
          ],
          name: 'withdrawBNB',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [sharesToWithdrawWei.toString(10)]
      ),
      tokens: [
        {
          token: getTokenAddress(shareToken),
          index: getInsertIndex(0),
        },
      ],
    };
  }

  protected fetchErc20ZapWithdraw(
    vaultAddress: string,
    shareToken: TokenErc20,
    sharesToWithdrawWei: BigNumber,
    withdrawAll: boolean
  ): ZapStep {
    if (withdrawAll) {
      return {
        target: vaultAddress,
        value: '0',
        data: abiCoder.encodeFunctionCall(
          {
            constant: false,
            inputs: [],
            name: 'withdrawAll',
            outputs: [],
            payable: false,
            stateMutability: 'nonpayable',
            type: 'function',
          },
          []
        ),
        tokens: [
          {
            token: getTokenAddress(shareToken),
            index: -1,
          },
        ],
      };
    }

    return {
      target: vaultAddress,
      value: '0',
      data: abiCoder.encodeFunctionCall(
        {
          constant: false,
          inputs: [
            {
              internalType: 'uint256',
              name: '_shares',
              type: 'uint256',
            },
          ],
          name: 'withdraw',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [sharesToWithdrawWei.toString(10)]
      ),
      tokens: [
        {
          token: getTokenAddress(shareToken),
          index: getInsertIndex(0),
        },
      ],
    };
  }
}
