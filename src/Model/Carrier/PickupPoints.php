<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */
namespace Innosend\PickupPoints\Model\Carrier;

use Magento\Quote\Model\Quote\Address\RateRequest;
use Magento\Shipping\Model\Carrier\AbstractCarrier;
use Magento\Shipping\Model\Carrier\CarrierInterface;
use Magento\Shipping\Model\Rate\Result;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Model\Quote\Address\RateResult\ErrorFactory;
use Psr\Log\LoggerInterface;
use Magento\Shipping\Model\Rate\ResultFactory;
use Magento\Quote\Model\Quote\Address\RateResult\MethodFactory;

/**
 * Pickup Points carrier model
 */
class PickupPoints extends AbstractCarrier implements CarrierInterface
{
    /**
     * @var string
     */
    protected $_code = 'innosend_pickup_points';

    /**
     * @var bool
     */
    protected $_isFixed = true;

    /**
     * @var ResultFactory
     */
    protected $_rateResultFactory;

    /**
     * @var MethodFactory
     */
    protected $_rateMethodFactory;

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param ErrorFactory $rateErrorFactory
     * @param LoggerInterface $logger
     * @param ResultFactory $rateResultFactory
     * @param MethodFactory $rateMethodFactory
     * @param array $data
     */
    public function __construct(
        ScopeConfigInterface $scopeConfig,
        ErrorFactory $rateErrorFactory,
        LoggerInterface $logger,
        ResultFactory $rateResultFactory,
        MethodFactory $rateMethodFactory,
        array $data = []
    ) {
        $this->_rateResultFactory = $rateResultFactory;
        $this->_rateMethodFactory = $rateMethodFactory;
        parent::__construct($scopeConfig, $rateErrorFactory, $logger, $data);
    }

    /**
     * Collect and get rates
     *
     * @param RateRequest $request
     * @return Result|bool
     */
    public function collectRates(RateRequest $request)
    {
        if (!$this->getConfigFlag('active')) {
            return false;
        }

        // Check if pickup points are enabled
        if (!$this->_scopeConfig->isSetFlag(
            'innosend/pickup_points/enabled',
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        )) {
            return false;
        }

        /** @var Result $result */
        $result = $this->_rateResultFactory->create();

        $shippingPrice = $this->getShippingPrice($request);

        if ($shippingPrice !== false) {
            $method = $this->createResultMethod($shippingPrice);
            $result->append($method);
        }

        return $result;
    }

    /**
     * Get allowed shipping methods
     *
     * @return array
     */
    public function getAllowedMethods()
    {
        return [$this->_code => $this->getConfigData('name')];
    }

    /**
     * Returns shipping price
     *
     * @param RateRequest $request
     * @return bool|float
     */
    private function getShippingPrice(RateRequest $request)
    {
        $shippingPrice = false;
        $configPrice = $this->getConfigData('price');

        if ($configPrice === null) {
            return false;
        }

        $type = $this->getConfigData('type');
        
        if ($type === 'O') {
            // Per order
            $shippingPrice = (float)$configPrice;
        } elseif ($type === 'I') {
            // Per item
            $shippingPrice = (float)$configPrice * $request->getPackageQty();
        } else {
            // None
            $shippingPrice = (float)$configPrice;
        }

        // Check free shipping thresholds
        if ($this->getConfigFlag('free_shipping_enable')) {
            $freeAmountThreshold = $this->getConfigData('free_shipping_amount_threshold');
            $freeWeightThreshold = $this->getConfigData('free_shipping_weight_threshold');
            
            if ($freeAmountThreshold && $request->getPackageValue() >= (float)$freeAmountThreshold) {
                $shippingPrice = 0;
            } elseif ($freeWeightThreshold && $request->getPackageWeight() >= (float)$freeWeightThreshold) {
                $shippingPrice = 0;
            }
        }

        // Include virtual products in price calculation
        if ($this->getConfigFlag('include_virtual_price')) {
            // Virtual products are already included in package value
        }

        $shippingPrice = $this->getFinalPriceWithHandlingFee($shippingPrice);

        return $shippingPrice;
    }

    /**
     * Creates result method
     *
     * @param int|float $shippingPrice
     * @return \Magento\Quote\Model\Quote\Address\RateResult\Method
     */
    private function createResultMethod($shippingPrice)
    {
        /** @var \Magento\Quote\Model\Quote\Address\RateResult\Method $method */
        $method = $this->_rateMethodFactory->create();

        $method->setCarrier($this->_code);
        $method->setCarrierTitle($this->getConfigData('title'));

        $method->setMethod($this->_code);
        $method->setMethodTitle($this->getConfigData('name'));

        $method->setPrice($shippingPrice);
        $method->setCost($shippingPrice);
        
        return $method;
    }
}


