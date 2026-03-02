<?php
/**
 * @package     Innosend_PickupPoints
 * @author      Henk Valk (henk@falconmedia.nl)
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Tests\Unit\Controller\Ajax;

use Innosend\PickupPoints\Controller\Ajax\GetPickupPoints;
use Innosend\PickupPoints\Helper\DayConverter;
use Innosend\PickupPoints\Helper\DistanceCalculator;
use Innosend\PickupPoints\Helper\Geocoder;
use Innosend\PickupPoints\Model\PickupPoint;
use Innosend\PickupPoints\Model\PickupPointRepository;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Unit tests for the GetPickupPoints AJAX controller
 */
class GetPickupPointsTest extends TestCase
{
    /** @var JsonFactory&MockObject */
    private $jsonFactory;

    /** @var PickupPointRepository&MockObject */
    private $repository;

    /** @var HttpRequest&MockObject */
    private $request;

    /** @var LoggerInterface&MockObject */
    private $logger;

    /** @var Geocoder&MockObject */
    private $geocoder;

    /** @var DistanceCalculator&MockObject */
    private $distanceCalculator;

    /** @var ScopeConfigInterface&MockObject */
    private $scopeConfig;

    /** @var DayConverter&MockObject */
    private $dayConverter;

    /** @var Json&MockObject */
    private $jsonResult;

    private GetPickupPoints $controller;

    protected function setUp(): void
    {
        $this->jsonFactory        = $this->createMock(JsonFactory::class);
        $this->repository         = $this->createMock(PickupPointRepository::class);
        $this->request            = $this->createMock(HttpRequest::class);
        $this->logger             = $this->createMock(LoggerInterface::class);
        $this->geocoder           = $this->createMock(Geocoder::class);
        $this->distanceCalculator = $this->createMock(DistanceCalculator::class);
        $this->scopeConfig        = $this->createMock(ScopeConfigInterface::class);
        $this->dayConverter       = $this->createMock(DayConverter::class);

        $this->jsonResult = $this->createMock(Json::class);
        $this->jsonResult->method('setData')->willReturnSelf();
        $this->jsonResult->method('setHttpResponseCode')->willReturnSelf();
        $this->jsonFactory->method('create')->willReturn($this->jsonResult);

        $this->controller = new GetPickupPoints(
            $this->jsonFactory,
            $this->repository,
            $this->request,
            $this->logger,
            $this->geocoder,
            $this->distanceCalculator,
            $this->scopeConfig,
            $this->dayConverter
        );
    }

    // -----------------------------------------------------------------------
    // Missing required params → 400
    // -----------------------------------------------------------------------

    public function testExecuteReturns400WhenNoAddressOrCoordinates(): void
    {
        $this->request->method('getParam')->willReturn('');
        $this->request->method('getPostValue')->willReturn([]);
        $this->request->method('getQueryValue')->willReturn([]);

        $this->jsonResult->expects($this->once())
            ->method('setData')
            ->with($this->callback(fn(array $d) => $d['success'] === false));

        $this->jsonResult->expects($this->once())
            ->method('setHttpResponseCode')
            ->with(400);

        $this->controller->execute();
    }

    // -----------------------------------------------------------------------
    // Empty API response → success=false
    // -----------------------------------------------------------------------

    public function testExecuteReturnsNoPickupPointsMessageWhenApiReturnsEmpty(): void
    {
        $this->request->method('getParam')
            ->willReturnMap([
                ['street', '', 'Damrak'],
                ['postcode', '', '1012AB'],
                ['city', '', 'Amsterdam'],
                ['country_code', '', 'NL'],
                ['latitude', null, null],
                ['longitude', null, null],
                ['search_latitude', null, null],
                ['search_longitude', null, null],
                ['couriers', null, null],
                ['carriers', null, null],
            ]);

        $this->request->method('getPostValue')->willReturn([]);
        $this->request->method('getQueryValue')->willReturn([]);

        $this->repository->method('getPickupPoints')->willReturn([]);
        $this->repository->method('getLastApiRequestUrl')->willReturn(null);

        $this->jsonResult->expects($this->once())
            ->method('setData')
            ->with($this->callback(fn(array $d) => $d['success'] === false));

        $this->controller->execute();
    }

    // -----------------------------------------------------------------------
    // LocalizedException from repository → 400
    // -----------------------------------------------------------------------

    public function testExecuteReturns400OnLocalizedException(): void
    {
        $this->request->method('getParam')
            ->willReturnMap([
                ['street', '', 'Damrak'],
                ['postcode', '', '1012'],
                ['city', '', 'Amsterdam'],
                ['country_code', '', 'NL'],
                ['latitude', null, null],
                ['longitude', null, null],
                ['search_latitude', null, null],
                ['search_longitude', null, null],
                ['couriers', null, null],
                ['carriers', null, null],
            ]);

        $this->request->method('getPostValue')->willReturn([]);
        $this->request->method('getQueryValue')->willReturn([]);

        $this->repository->method('getPickupPoints')
            ->willThrowException(new LocalizedException(__('API not enabled')));

        $this->jsonResult->expects($this->once())
            ->method('setHttpResponseCode')
            ->with(400);

        $this->controller->execute();
    }

    // -----------------------------------------------------------------------
    // Successful response
    // -----------------------------------------------------------------------

    public function testExecuteReturnsPickupPointsOnSuccess(): void
    {
        $this->request->method('getParam')
            ->willReturnMap([
                ['street', '', 'Damrak'],
                ['postcode', '', '1012'],
                ['city', '', 'Amsterdam'],
                ['country_code', '', 'NL'],
                ['latitude', null, null],
                ['longitude', null, null],
                ['search_latitude', null, null],
                ['search_longitude', null, null],
                ['couriers', null, null],
                ['carriers', null, null],
            ]);

        $this->request->method('getPostValue')->willReturn([]);
        $this->request->method('getQueryValue')->willReturn([]);

        $point = $this->createMock(PickupPoint::class);
        $point->method('getId')->willReturn('PP001');
        $point->method('getName')->willReturn('DHL Point');
        $point->method('getAddress')->willReturn('Damrak 1, 1012AB, Amsterdam');
        $point->method('getStreet')->willReturn('Damrak 1');
        $point->method('getPostcode')->willReturn('1012AB');
        $point->method('getCity')->willReturn('Amsterdam');
        $point->method('getCountryCode')->willReturn('NL');
        $point->method('getLatitude')->willReturn(52.37);
        $point->method('getLongitude')->willReturn(4.89);
        $point->method('getCarrier')->willReturn('dhl');
        $point->method('getLogo')->willReturn('');
        $point->method('getMarkImage')->willReturn('');
        $point->method('getDistance')->willReturn(null);
        $point->method('getOpeningHours')->willReturn([]);

        $this->repository->method('getPickupPoints')->willReturn([$point]);
        $this->repository->method('getLastApiRequestUrl')->willReturn('https://api.innosend.eu/v1/pickup-point/');

        $this->jsonResult->expects($this->once())
            ->method('setData')
            ->with($this->callback(fn(array $d) => $d['success'] === true && count($d['data']) === 1));

        $this->controller->execute();
    }
}
