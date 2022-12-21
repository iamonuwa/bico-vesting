import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { BigNumber } from 'ethers';
import React from 'react';
import {
  useAccount,
  useContractReads,
  useContractWrite,
  useNetwork,
  usePrepareContractWrite,
  useSwitchNetwork,
  useWaitForTransaction,
} from 'wagmi';
import vestingABI from '../../abis/vesting.abi.json';
import { formatBigNumber } from '../../utils/formatBigNumber';
import { Claim, formatClaim } from '../../utils/formatClaim';
import { ProgressBar } from '../ProgressBar';
import {
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from '../Toast';
import toastStyles from '../Toast/Toast.module.css';
import styles from './ConnectedApp.module.css';
dayjs.extend(relativeTime);

const VESTING_ADDRESS =
  import.meta.env.MODE === 'production'
    ? '0xeE3593817fB142BFBEA560fcF47b3f354f519D33'
    : '0x483C9102a938D3d1f0bc4dc73bea831A2048D55b';

const vestingContract = {
  address: VESTING_ADDRESS,
  abi: vestingABI,
};

const ConnectedApp = () => {
  const [open, setOpen] = React.useState(false);
  const [toastInfo, setToastInfo] = React.useState({
    title: '',
    description: '',
  });
  const timerRef = React.useRef(0);
  const { address } = useAccount();
  const { chain, chains } = useNetwork();
  const { isLoading: switchNetworkLoading, switchNetwork } = useSwitchNetwork();

  React.useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const {
    data: vestingData,
    isError,
    isLoading,
    refetch,
  } = useContractReads({
    contracts: [
      {
        ...vestingContract,
        functionName: 'getClaim',
        args: [address],
        chainId: 5,
      },
      {
        ...vestingContract,
        functionName: 'claimableAmount',
        args: [address],
        chainId: 5,
      },
      {
        ...vestingContract,
        functionName: 'paused',
        chainId: 5,
      },
    ],
  });
  const data = vestingData as [Claim, BigNumber, boolean];
  const [claim, claimableAmount, paused] = data ?? [];

  const { config } = usePrepareContractWrite({
    address: VESTING_ADDRESS,
    abi: vestingABI,
    functionName: 'claim',
  });
  const {
    data: claimTokens,
    isLoading: claimTokensLoading,
    write,
  } = useContractWrite({
    ...config,
    onSuccess: () => {
      setOpen(false);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setToastInfo({
          title: 'Transaction sent 👍',
          description: 'Please wait for the transaction to be approved.',
        });
        setOpen(true);
      }, 100);
    },
    onError: () => {
      setOpen(false);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setToastInfo({
          title: 'Failed to send transaction 🙁',
          description:
            'We were unable to send the transaction. Please try again later.',
        });
        setOpen(true);
      }, 100);
    },
  });
  const { isLoading: claimTokensTxLoading, isSuccess: claimTokensTxSuccess } =
    useWaitForTransaction({
      hash: claimTokens?.hash,
      onSuccess: () => {
        refetch();
        setOpen(false);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setToastInfo({
            title: 'Tokens claimed 🎉',
            description: 'You have successfully claimed your tokens.',
          });
          setOpen(true);
        }, 100);
      },
      onError: () => {
        setOpen(false);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setToastInfo({
            title: 'Failed to claim tokens 😢',
            description:
              'We were unable to claim your tokens. Please try again later.',
          });
          setOpen(true);
        }, 100);
      },
    });

  // Loading state
  if (isLoading) {
    return (
      <section className={styles.slice}>
        <p>Loading...</p>
      </section>
    );
  }

  // Error state
  if (isError) {
    return (
      <section className={styles.slice}>
        <p>We were unable to fetch the claims data. Please try again later.</p>
      </section>
    );
  }

  // Desctructure claim data
  const {
    vestAmount,
    unlockAmount,
    endTime,
    amountClaimed: tokensClaimed,
  } = formatClaim(claim);

  // Current and matury dates
  const currentDate = Math.round(Date.now() / 1000);
  const maturityDate = new Date(Number.parseFloat(endTime.toString()) * 1000);

  // Claimable and total claimable tokens
  const claimableTokens = formatBigNumber(claimableAmount) + tokensClaimed;
  const totalClaimableTokens = vestAmount + unlockAmount;

  // Generated tokens, claimed tokens and availability
  const streamedTokens = (claimableTokens / totalClaimableTokens) * 100 || 0;
  const claimedTokens = (tokensClaimed / claimableTokens) * 100 || 0;
  const availability = (claimableTokens - tokensClaimed).toLocaleString();

  // Maturity status
  let maturityStatus = `${dayjs(maturityDate).fromNow(true)} till maturity`;
  if (
    currentDate > Number.parseFloat(claim.endTime.toString()) ||
    !claim.endTime
  ) {
    maturityStatus = 'Complete';
  } else if (paused) {
    maturityStatus = 'Paused';
  } else if (totalClaimableTokens !== tokensClaimed && !claim.isActive) {
    maturityStatus = 'Revoked';
  }

  // Is claim exhausted?
  const areClaimsDisabled =
    paused ||
    tokensClaimed >= totalClaimableTokens ||
    tokensClaimed >= claimableTokens ||
    !claim.isActive;

  return (
    <section className={styles.slice}>
      <ToastProvider swipeDirection="right">
        <header className={styles.sectionHeader}>
          <h1>Claim Tokens</h1>
          {chain && chains.find((chainObj) => chainObj.id === chain.id) ? (
            <button
              className={styles.claimTokensBtn}
              disabled={areClaimsDisabled || claimTokensLoading || !write}
              onClick={() => write?.()}
            >
              {claimTokensTxLoading
                ? 'Claiming...'
                : claimTokensTxSuccess
                ? 'Claimed'
                : 'Claim Bico'}
            </button>
          ) : (
            //  Since we only have a single chain, we can use the first one.
            <button
              disabled={!switchNetwork}
              onClick={() => switchNetwork?.(chains[0].id)}
            >
              {switchNetworkLoading
                ? `Switching to ${chains[0].name}...}`
                : `Switch to ${chains[0].name}`}
            </button>
          )}
        </header>

        {/* Vesting information */}
        <article className={styles.article}>
          <h2>Streamed</h2>
          <ProgressBar value={streamedTokens} aria-label="Streamed tokens" />
          <p>
            {claimableTokens.toLocaleString()} /{' '}
            {totalClaimableTokens.toLocaleString()} total tokens
          </p>
        </article>

        <article className={styles.article}>
          <h2>Claimed</h2>
          <ProgressBar value={claimedTokens} aria-label="Claimed tokens" />
          <p>
            {tokensClaimed.toLocaleString()} /{' '}
            {claimableTokens.toLocaleString()} tokens claimed
          </p>
        </article>

        <article className={styles.article}>
          <h2>Time left</h2>
          <p>{maturityStatus}</p>
        </article>

        <article className={styles.article}>
          <h2>Availability</h2>
          <p>{availability} tokens available to claim</p>
        </article>

        {/* Toast */}
        <ToastRoot
          className={toastStyles.toastRoot}
          open={open}
          onOpenChange={setOpen}
        >
          <ToastTitle className={toastStyles.toastTitle}>
            {toastInfo.title}
          </ToastTitle>
          <ToastDescription asChild>
            <p className={toastStyles.toastDescription}>
              {toastInfo.description}
            </p>
          </ToastDescription>
          <ToastClose className={toastStyles.toastClose} aria-label="Close">
            Dismiss
          </ToastClose>
        </ToastRoot>
        <ToastViewport className={toastStyles.toastViewport} />
      </ToastProvider>
    </section>
  );
};

export { ConnectedApp };
